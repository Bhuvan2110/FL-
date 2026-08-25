import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from _shared import get_db, json_response, error_response, bearer_token, make_handler


def _handler_impl(request):
    if request.method == "OPTIONS":
        return json_response({})

    if request.method != "POST":
        return error_response("Method not allowed", 405)

    token = bearer_token(request)
    if token:
        try:
            db = get_db()
            db.auth.sign_out(token)
        except Exception:
            pass

    return json_response({"message": "Signed out successfully"})


# Vercel Python runtime entrypoint (class-based, required — see _shared.make_handler)
handler = make_handler(_handler_impl)
