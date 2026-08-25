import json, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
try:
    from _shared import get_db, get_write_db, json_response, error_response, make_handler
except ImportError:
    from api._shared import get_db, get_write_db, json_response, error_response, make_handler


def _handler_impl(request):
    if request.method == "OPTIONS":
        return json_response({})
    if request.method != "POST":
        return error_response("Method not allowed", 405)
    try:
        body     = json.loads(request.body)
        email    = body.get("email", "").strip()
        password = body.get("password", "")
        if not email or not password:
            return error_response("Email and password required")
        db   = get_db()
        resp = db.auth.sign_up({"email": email, "password": password})
        if not resp.user:
            return error_response("Signup failed")

        write_db = get_write_db()
        role = "super_admin" if email in ("sbhuvan847@gmail.com", "sbhuvan832@gmail.com") else "user"
        try:
            write_db.from_("profiles").upsert({
                "id":    resp.user.id,
                "email": email,
                "role":  role,
            }).execute()
        except Exception:
            pass

        return json_response({
            "message": "Account created. Sign in now.",
            "user_id": resp.user.id,
        })
    except Exception as e:
        return error_response(str(e))


handler = make_handler(_handler_impl)
