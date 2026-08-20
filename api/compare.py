import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from _shared import get_db, json_response, error_response, require_auth, is_admin, make_handler


@require_auth
def _handler_impl(request, user):
    if request.method == "OPTIONS":
        return json_response({})

    db         = get_db()
    admin_view = request.query.get("admin_view", "false").lower() == "true"
    admin      = is_admin(user.id)

    try:
        # Summary endpoint
        if request.query.get("summary") == "true":
            ds_r  = db.from_("datasets").select("id", count="exact").eq("user_id", user.id).execute()
            exp_r = db.from_("experiments").select("id", count="exact").eq("user_id", user.id).execute()
            met_r = db.from_("metrics").select("accuracy").execute()
            prv_r = (
                db.from_("privacy_budget")
                .select("epsilon")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            best_acc  = max((m["accuracy"] for m in (met_r.data or [])), default=None)
            latest_ep = prv_r.data[0]["epsilon"] if prv_r.data else None
            return json_response({
                "datasets":        ds_r.count or 0,
                "experiments":     exp_r.count or 0,
                "best_accuracy":   round(best_acc, 4) if best_acc else None,
                "latest_epsilon":  round(latest_ep, 4) if latest_ep else None,
            })

        # Rounds for one experiment
        exp_id = request.query.get("rounds", "")
        if exp_id:
            exp = db.from_("experiments").select("user_id").eq("id", exp_id).single().execute()
            if not exp.data:
                return error_response("Not found", 404)
            if exp.data["user_id"] != user.id and not admin:
                return error_response("Not authorised", 403)
            resp = (
                db.from_("rounds")
                .select("*")
                .eq("experiment_id", exp_id)
                .order("round_num")
                .execute()
            )
            return json_response({"rounds": resp.data or []})

        # Full comparison data
        q = (
            db.from_("experiments")
            .select("*")
            .eq("status", "completed")
            .order("created_at", desc=True)
        )
        if not (admin_view and admin):
            q = q.eq("user_id", user.id)
        exps = q.execute()
        experiments = exps.data or []

        if not experiments:
            return json_response({"experiments": [], "metrics": [], "privacy": []})

        ids = [e["id"] for e in experiments]
        metrics_r = db.from_("metrics").select("*").in_("experiment_id", ids).execute()
        privacy_r = (
            db.from_("privacy_budget")
            .select("*")
            .in_("experiment_id", ids)
            .order("round_num")
            .execute()
        )
        return json_response({
            "experiments": experiments,
            "metrics":     metrics_r.data or [],
            "privacy":     privacy_r.data or [],
        })

    except Exception as e:
        return error_response(str(e), 500)


# Vercel Python runtime entrypoint (class-based, required — see _shared.make_handler)
handler = make_handler(_handler_impl)
