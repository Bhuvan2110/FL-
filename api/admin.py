import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from _shared import get_db, json_response, error_response, require_auth, is_admin, log_audit, make_handler


@require_auth
def _handler_impl(request, user):
    if request.method == "OPTIONS":
        return json_response({})

    if not is_admin(user.id):
        return error_response("Admin access required", 403)

    db   = get_db()
    path = request.query.get("action", "audit")

    try:
        # GET audit logs
        if path == "audit":
            limit = int(request.query.get("limit", 100))
            resp  = (
                db.from_("audit_logs")
                .select("*")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            return json_response({"logs": resp.data or [], "count": len(resp.data or [])})

        # GET all users
        if path == "users":
            resp = db.from_("profiles").select("*").order("created_at", desc=True).execute()
            return json_response({"users": resp.data or []})

        # PATCH user role
        if path == "role" and request.method == "PATCH":
            body    = json.loads(request.body)
            user_id = body.get("user_id", "")
            role    = body.get("role", "")
            if role not in ("user", "admin", "super_admin"):
                return error_response("Invalid role")
            db.from_("profiles").update({"role": role}).eq("id", user_id).execute()
            log_audit(user.id, "role_change", user_id, {"new_role": role})
            return json_response({"updated": True, "user_id": user_id, "role": role})

        # GET platform stats
        if path == "stats":
            users_r = db.from_("profiles").select("id", count="exact").execute()
            ds_r    = db.from_("datasets").select("id", count="exact").execute()
            exp_r   = db.from_("experiments").select("id, algorithm, status").execute()
            pred_r  = db.from_("predictions").select("id", count="exact").execute()
            exps    = exp_r.data or []
            by_algo, by_status = {}, {}
            for e in exps:
                by_algo[e["algorithm"]]  = by_algo.get(e["algorithm"], 0)  + 1
                by_status[e["status"]]   = by_status.get(e["status"], 0)   + 1
            return json_response({
                "total_users":       users_r.count or 0,
                "total_datasets":    ds_r.count    or 0,
                "total_experiments": len(exps),
                "total_predictions": pred_r.count  or 0,
                "experiments_by_algorithm": by_algo,
                "experiments_by_status":    by_status,
            })

        return error_response("Unknown action", 400)

    except Exception as e:
        return error_response(str(e), 500)


# Vercel Python runtime entrypoint (class-based, required — see _shared.make_handler)
handler = make_handler(_handler_impl)
