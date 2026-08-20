import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from _shared import get_db, json_response, error_response, require_auth


@require_auth
def handler(request, user):
    try:
        db   = get_db()
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
