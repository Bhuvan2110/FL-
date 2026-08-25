import json, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
try:
    from _shared import get_db, get_write_db, json_response, error_response, log_audit, FRONTEND_URL, make_handler
except ImportError:
    from api._shared import get_db, get_write_db, json_response, error_response, log_audit, FRONTEND_URL, make_handler


def _handler_impl(request):
    if request.method == "OPTIONS":
        return json_response({})

    if request.method != "POST":
        return error_response("Method not allowed", 405)

    try:
        body = json.loads(request.body)
        email    = body.get("email", "").strip()
        password = body.get("password", "")

        if not email or not password:
            return error_response("Email and password required")

        db   = get_db()
        resp = db.auth.sign_in_with_password({"email": email, "password": password})

        if not resp.user or not resp.session:
            return error_response("Invalid email or password", 401)

        token = resp.session.access_token
        write_db = get_write_db(token)

        # Retrieve profile safely, create if missing
        profile_resp = write_db.from_("profiles").select("*").eq("id", resp.user.id).execute()
        profile_data = profile_resp.data if isinstance(profile_resp.data, list) else []
        if profile_data and isinstance(profile_data[0], dict):
            profile = profile_data[0]
        else:
            role = "super_admin" if email in ("sbhuvan847@gmail.com", "sbhuvan832@gmail.com") else "user"
            try:
                new_p = write_db.from_("profiles").insert({
                    "id": resp.user.id,
                    "email": email,
                    "role": role,
                }).execute()
                profile = new_p.data[0] if (new_p.data and isinstance(new_p.data, list)) else {"id": resp.user.id, "email": email, "role": role}
            except Exception:
                profile = {"id": resp.user.id, "email": email, "role": role}

        log_audit(resp.user.id, "login", "auth", token=token)

        return json_response({
            "access_token": resp.session.access_token,
            "token_type":   "bearer",
            "user":    {"id": resp.user.id, "email": resp.user.email},
            "profile": profile,
        })
    except Exception as e:
        return error_response(str(e), 401)


handler = make_handler(_handler_impl)
