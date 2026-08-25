import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
try:
    from _shared import get_db, get_write_db, bearer_token, json_response, error_response, require_auth, make_handler
except ImportError:
    from api._shared import get_db, get_write_db, bearer_token, json_response, error_response, require_auth, make_handler


@require_auth
def _handler_impl(request, user):
    token = getattr(request, "token", "") or bearer_token(request)
    write_db = get_write_db(token)
    profile_resp = write_db.from_("profiles").select("*").eq("id", user.id).execute()
    profile_data = profile_resp.data if isinstance(profile_resp.data, list) else []
    if profile_data and isinstance(profile_data[0], dict):
        profile = profile_data[0]
    else:
        role = "super_admin" if user.email in ("sbhuvan847@gmail.com", "sbhuvan832@gmail.com") else "user"
        try:
            new_p = write_db.from_("profiles").insert({
                "id":    user.id,
                "email": user.email,
                "role":  role,
            }).execute()
            profile = new_p.data[0] if (new_p.data and isinstance(new_p.data, list)) else {"id": user.id, "email": user.email, "role": role}
        except Exception:
            profile = {"id": user.id, "email": user.email, "role": role}

    return json_response({
        "user":    {"id": user.id, "email": user.email},
        "profile": profile,
    })


handler = make_handler(_handler_impl)
