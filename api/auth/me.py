import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from _shared import get_db, json_response, error_response, require_auth, make_handler


@require_auth
def _handler_impl(request, user):
    db      = get_db()
    profile = db.from_("profiles").select("*").eq("id", user.id).single().execute()
    return json_response({
        "user":    {"id": user.id, "email": user.email},
        "profile": profile.data or {},
    })


# Vercel Python runtime entrypoint (class-based, required — see _shared.make_handler)
handler = make_handler(_handler_impl)
