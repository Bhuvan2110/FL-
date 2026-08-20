import json, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from _shared import get_db, json_response, error_response, make_handler


def _handler_impl(request):
    if request.method == "OPTIONS":
        return json_response({})
    if request.method != "POST":
        return error_response("Method not allowed", 405)
    try:
        body     = json.loads(request.body)
        email    = body.get("email", "")
        password = body.get("password", "")
        if not email or not password:
            return error_response("Email and password required")
        db   = get_db()
        resp = db.auth.sign_up({"email": email, "password": password})
        if not resp.user:
            return error_response("Signup failed")
        return json_response({
            "message": "Account created. Sign in now.",
            "user_id": resp.user.id,
        })
    except Exception as e:
        return error_response(str(e))


# Vercel Python runtime entrypoint (class-based, required — see _shared.make_handler)
handler = make_handler(_handler_impl)
