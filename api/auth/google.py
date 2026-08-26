import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

try:
    from _shared import get_db, json_response, error_response, FRONTEND_URL, make_handler
except ImportError:
    from api._shared import get_db, json_response, error_response, FRONTEND_URL, make_handler


def _handler_impl(request):
    if request.method == "OPTIONS":
        return json_response({})

    try:
        host = (
            request.headers.get("x-forwarded-host", "")
            or request.headers.get("host", "")
            or request.headers.get("Host", "")
        )

        proto = (
            request.headers.get("x-forwarded-proto", "")
            or ("http" if ("localhost" in host or "127.0.0.1" in host) else "https")
        )

        # This is the URL Supabase should redirect to AFTER Google authentication.
        # Do NOT use the Supabase /auth/v1/callback URL here.
        if host:
            redirect_uri = f"{proto}://{host}/auth/callback"
        else:
            redirect_uri = f"{FRONTEND_URL.rstrip('/')}/auth/callback"

        db = get_db()

        resp = db.auth.sign_in_with_oauth({
            "provider": "google",
            "options": {
                "redirect_to": redirect_uri,
                "scopes": "openid email profile",
            },
        })

        return json_response({"url": resp.url})

    except Exception as e:
        return error_response(str(e), 500)


handler = make_handler(_handler_impl)