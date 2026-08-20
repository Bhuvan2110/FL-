import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from _shared import get_db, json_response, error_response, require_auth


@require_auth
def handler(request, user):
    db      = get_db()
    profile = db.from_("profiles").select("*").eq("id", user.id).single().execute()
    return json_response({
        "user":    {"id": user.id, "email": user.email},
        "profile": profile.data or {},
    })
