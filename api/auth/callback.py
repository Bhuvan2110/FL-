import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
try:
    from _shared import get_db, get_write_db, json_response, error_response, log_audit, FRONTEND_URL, make_handler
except ImportError:
    from api._shared import get_db, get_write_db, json_response, error_response, log_audit, FRONTEND_URL, make_handler


def _handler_impl(request):
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
        write_db = get_write_db(token)

        # Ensure profile exists
        existing = write_db.from_("profiles").select("id").eq("id", user.id).execute()
        if not existing.data:
            role = "super_admin" if user.email in ("sbhuvan847@gmail.com", "sbhuvan832@gmail.com") else "user"
            try:
                write_db.from_("profiles").insert({
                    "id":    user.id,
                    "email": user.email,
                    "role":  role,
                }).execute()
            except Exception:
                pass

        log_audit(user.id, "google_login", "auth", token=token)

        host = request.headers.get("x-forwarded-host", "") or request.headers.get("host", "") or request.headers.get("Host", "")
        proto = request.headers.get("x-forwarded-proto", "") or ("http" if ("localhost" in host or "127.0.0.1" in host) else "https")
        if host:
            target_frontend = f"{proto}://{host}"
        else:
            target_frontend = FRONTEND_URL.rstrip("/")

        redirect_url = f"{target_frontend}/login#access_token={token}"
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


handler = make_handler(_handler_impl)
