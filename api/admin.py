import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from _shared import get_db, json_response, error_response, require_auth, is_admin, log_audit, make_handler, bearer_token


try:
    from postgrest.base_request_builder import CountMethod
    COUNT_EXACT: CountMethod = CountMethod.exact
except ImportError:
    COUNT_EXACT = "exact"  # type: ignore


@require_auth
def _handler_impl(request, user):
    if request.method == "OPTIONS":
        return json_response({})

    token = getattr(request, "token", "") or bearer_token(request)
    if not is_admin(user.id, token):
        return error_response("Admin access required", 403)

    db   = get_db(token)
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
            logs = resp.data if isinstance(resp.data, list) else []
            return json_response({"logs": logs, "count": len(logs)})

        # GET all users
        if path == "users":
            resp = db.from_("profiles").select("*").order("created_at", desc=True).execute()
            users = resp.data if isinstance(resp.data, list) else []
            return json_response({"users": users})

        # PATCH user role
        if path == "role" and request.method == "PATCH":
            body    = json.loads(request.body or "{}") if request.body else {}
            if not isinstance(body, dict):
                return error_response("Invalid request body", 400)
            user_id = body.get("user_id", "")
            role    = body.get("role", "")
            if role not in ("user", "admin", "super_admin"):
                return error_response("Invalid role")
            db.from_("profiles").update({"role": role}).eq("id", user_id).execute()
            log_audit(user.id, "role_change", user_id, {"new_role": role}, token=token)
            return json_response({"updated": True, "user_id": user_id, "role": role})

        # GET platform stats
        if path == "stats":
            users_r = db.from_("profiles").select("id", count=COUNT_EXACT).execute()
            ds_r    = db.from_("datasets").select("id", count=COUNT_EXACT).execute()
            exp_r   = db.from_("experiments").select("id, algorithm, status").execute()
            pred_r  = db.from_("predictions").select("id", count=COUNT_EXACT).execute()
            exps    = exp_r.data if isinstance(exp_r.data, list) else []
            by_algo, by_status = {}, {}
            for e in exps:
                if not e or not isinstance(e, dict):
                    continue
                algo   = str(e.get("algorithm") or "unknown")
                status = str(e.get("status")   or "unknown")
                by_algo[algo]     = by_algo.get(algo, 0)   + 1
                by_status[status] = by_status.get(status, 0) + 1
            return json_response({
                "total_users":       getattr(users_r, "count", 0) or 0,
                "total_datasets":    getattr(ds_r, "count", 0)    or 0,
                "total_experiments": len(exps),
                "total_predictions": getattr(pred_r, "count", 0)  or 0,
                "experiments_by_algorithm": by_algo,
                "experiments_by_status":    by_status,
            })

        return error_response("Unknown action", 400)

    except Exception as e:
        return error_response(str(e), 500)


# Vercel Python runtime entrypoint (class-based, required — see _shared.make_handler)
handler = make_handler(_handler_impl)
