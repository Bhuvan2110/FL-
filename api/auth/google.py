import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from _shared import get_db, json_response, error_response, FRONTEND_URL

GOOGLE_REDIRECT_URI = os.environ.get(
    "GOOGLE_REDIRECT_URI",
    f"{FRONTEND_URL}/api/auth/callback"
)


def handler(request):
    if request.method == "OPTIONS":
        return json_response({})
    try:
        db   = get_db()
        resp = db.auth.sign_in_with_oauth({
            "provider": "google",
            "options": {
                "redirect_to": GOOGLE_REDIRECT_URI,
                "scopes": "openid email profile",
            },
        })
        return json_response({"url": resp.url})
    except Exception as e:
        return error_response(str(e), 500)
