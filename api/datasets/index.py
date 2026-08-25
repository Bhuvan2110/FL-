import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
try:
    from _shared import get_db, get_write_db, json_response, error_response, bearer_token, require_auth, make_handler
except ImportError:
    from api._shared import get_db, get_write_db, json_response, error_response, bearer_token, require_auth, make_handler


@require_auth
def _handler_impl(request, user):
    try:
        token = getattr(request, "token", "") or bearer_token(request)
        db   = get_write_db(token)   # service role bypasses RLS; filters by user_id below
        resp = (
            db.from_("datasets")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", desc=True)
            .execute()
        )
        return json_response({"datasets": resp.data or []})
    except Exception as e:
        return error_response(str(e), 500)


# Vercel Python runtime entrypoint (class-based, required — see _shared.make_handler)
handler = make_handler(_handler_impl)
