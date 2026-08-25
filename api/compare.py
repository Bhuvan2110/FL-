import sys, os
sys.path.insert(0, os.path.dirname(__file__))
try:
    from _shared import get_db, json_response, error_response, bearer_token, require_auth, is_admin, make_handler
except ImportError:
    from api._shared import get_db, json_response, error_response, bearer_token, require_auth, is_admin, make_handler


try:
    from postgrest.base_request_builder import CountMethod
    COUNT_EXACT: CountMethod = CountMethod.exact
except ImportError:
    COUNT_EXACT = "exact"  # type: ignore


@require_auth
def _handler_impl(request, user):
    if request.method == "OPTIONS":
        return json_response({})

    token      = getattr(request, "token", "") or bearer_token(request)
    db         = get_db(token)
    admin_view = request.query.get("admin_view", "false").lower() == "true"
    admin      = is_admin(user.id, token)

    try:
        # Summary endpoint
        if request.query.get("summary") == "true":
            ds_r  = db.from_("datasets").select("id", count=COUNT_EXACT).eq("user_id", user.id).execute()
            exp_r = db.from_("experiments").select("id", count=COUNT_EXACT).eq("user_id", user.id).execute()
            met_r = db.from_("metrics").select("accuracy").execute()
            prv_r = (
                db.from_("privacy_budget")
                .select("epsilon")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            met_rows = met_r.data if isinstance(met_r.data, list) else []
            prv_rows = prv_r.data if isinstance(prv_r.data, list) else []
            accuracies = [float(m["accuracy"]) for m in met_rows if isinstance(m, dict) and "accuracy" in m and isinstance(m["accuracy"], (int, float))]
            best_acc  = max(accuracies) if accuracies else None
            latest_ep = float(prv_rows[0]["epsilon"]) if (prv_rows and isinstance(prv_rows[0], dict) and "epsilon" in prv_rows[0] and isinstance(prv_rows[0]["epsilon"], (int, float))) else None
            return json_response({
                "datasets":        getattr(ds_r, "count", 0) or 0,
                "experiments":     getattr(exp_r, "count", 0) or 0,
                "best_accuracy":   round(best_acc, 4) if best_acc is not None else None,
                "latest_epsilon":  round(latest_ep, 4) if latest_ep is not None else None,
            })

        # Rounds for one experiment
        exp_id = request.query.get("rounds", "")
        if exp_id:
            exp = db.from_("experiments").select("user_id").eq("id", exp_id).single().execute()
            exp_data = exp.data if isinstance(exp.data, dict) else {}
            if not exp_data:
                return error_response("Not found", 404)
            if exp_data.get("user_id") != user.id and not admin:
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

        ids = [str(e["id"]) for e in experiments if isinstance(e, dict) and "id" in e]
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
