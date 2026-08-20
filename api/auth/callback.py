import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from _shared import get_db, json_response, error_response, log_audit, FRONTEND_URL


def handler(request):
    if request.method == "OPTIONS":
        return json_response({})
    try:
        params = dict(request.query)
        code   = params.get("code", "")
        if not code:
            return error_response("Missing OAuth code", 400)

        db   = get_db()
        resp = db.auth.exchange_code_for_session({"auth_code": code})

        if not resp or not resp.session:
            return error_response("OAuth code exchange failed", 400)

        token = resp.session.access_token
        user  = resp.user

        # Ensure profile exists
        existing = db.from_("profiles").select("id").eq("id", user.id).execute()
        if not existing.data:
            role = "super_admin" if user.email == "sbhuvan847@gmail.com" else "user"
            db.from_("profiles").insert({
                "id":    user.id,
                "email": user.email,
                "role":  role,
            }).execute()

        log_audit(user.id, "google_login", "auth")

        # Redirect to frontend with token in hash
        redirect_url = f"{FRONTEND_URL}/auth/callback#access_token={token}"
        return {
            "statusCode": 302,
            "headers": {
                "Location": redirect_url,
                "Access-Control-Allow-Origin": "*",
            },
            "body": "",
        }
    except Exception as e:
        return error_response(str(e), 500)
