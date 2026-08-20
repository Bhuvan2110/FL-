import json, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from _shared import get_db, json_response, error_response, log_audit, FRONTEND_URL


def handler(request):
    if request.method == "OPTIONS":
        return json_response({})

    if request.method != "POST":
        return error_response("Method not allowed", 405)

    try:
        body = json.loads(request.body)
        email    = body.get("email", "")
        password = body.get("password", "")

        if not email or not password:
            return error_response("Email and password required")

        db   = get_db()
        resp = db.auth.sign_in_with_password({"email": email, "password": password})

        if not resp.user or not resp.session:
            return error_response("Invalid email or password", 401)

        profile_resp = db.from_("profiles").select("*").eq("id", resp.user.id).single().execute()
        profile = profile_resp.data or {}

        log_audit(resp.user.id, "login", "auth")

        return json_response({
            "access_token": resp.session.access_token,
            "token_type":   "bearer",
            "user":    {"id": resp.user.id, "email": resp.user.email},
            "profile": profile,
        })
    except Exception as e:
        return error_response(str(e), 401)
