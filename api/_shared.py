"""
Shared helpers used by all Vercel Python API functions.
Vercel serverless: each /api/*.py file is one function, no FastAPI needed.
"""
import os, json
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from supabase import create_client

SUPABASE_URL     = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
ENCRYPTION_SECRET = os.environ.get("ENCRYPTION_SECRET", "fedshield-aes-secret-key-32chars!!")
FRONTEND_URL      = os.environ.get("FRONTEND_URL", "https://fedshield-fl.vercel.app")


def get_db():
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


def get_user(token: str):
    """Validate Supabase JWT and return the user object."""
    db = get_db()
    resp = db.auth.get_user(token)
    if not resp or not resp.user:
        return None
    return resp.user


def bearer_token(request) -> str:
    auth = request.headers.get("authorization", "") or request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return ""


def json_response(data, status=200):
    body = json.dumps(data)
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Authorization,Content-Type",
        },
        "body": body,
    }


def error_response(message, status=400):
    return json_response({"error": message}, status)


def require_auth(handler):
    """Decorator — extracts + validates bearer token, injects user into handler."""
    def wrapper(request):
        if request.method == "OPTIONS":
            return json_response({})
        token = bearer_token(request)
        if not token:
            return error_response("Not authenticated", 401)
        user = get_user(token)
        if not user:
            return error_response("Invalid or expired token", 401)
        return handler(request, user)
    return wrapper


def get_profile(user_id: str):
    db = get_db()
    resp = db.from_("profiles").select("*").eq("id", user_id).single().execute()
    return resp.data or {}


def is_admin(user_id: str) -> bool:
    profile = get_profile(user_id)
    return profile.get("role") in ("admin", "super_admin")


def log_audit(user_id: str, action: str, resource: str = "", detail: dict = None):
    try:
        db = get_db()
        db.from_("audit_logs").insert({
            "user_id": user_id,
            "action":  action,
            "resource": resource,
            "detail":  detail or {},
        }).execute()
    except Exception:
        pass


class _SimpleRequest:
    """Adapts Vercel's raw BaseHTTPRequestHandler request into the plain
    .method / .headers / .query / .body interface every api/*.py handler
    in this codebase is written against."""
    def __init__(self, method, headers, query, body):
        self.method  = method
        self.headers = headers  # email.message.Message — .get() is case-insensitive
        self.query   = query    # plain dict
        self.body    = body     # raw bytes


def make_handler(fn):
    """
    Wraps a `fn(request) -> dict` handler (the {"statusCode","headers","body"}
    shape produced by json_response/error_response) into the class-based
    entrypoint Vercel's Python runtime actually requires: a file-level
    `handler` that inherits from BaseHTTPRequestHandler. A bare top-level
    function named `handler` is NOT a supported entrypoint and fails to
    deploy — this factory is what every api/*.py file uses to stay a thin,
    testable function while still satisfying Vercel's runtime contract.
    """
    class VercelHandler(BaseHTTPRequestHandler):
        def _dispatch(self):
            try:
                length = int(self.headers.get("Content-Length", 0) or 0)
            except ValueError:
                length = 0
            body = self.rfile.read(length) if length else b""
            parsed = urlparse(self.path)
            query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
            request = _SimpleRequest(self.command, self.headers, query, body)

            try:
                result = fn(request)
            except Exception as e:
                result = error_response(str(e), 500)

            status       = result.get("statusCode", 200)
            resp_headers = result.get("headers", {}) or {}
            resp_body    = result.get("body", "")
            if isinstance(resp_body, str):
                resp_body = resp_body.encode("utf-8")

            self.send_response(status)
            for k, v in resp_headers.items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(resp_body)

        def do_GET(self):     self._dispatch()
        def do_POST(self):    self._dispatch()
        def do_PUT(self):     self._dispatch()
        def do_PATCH(self):   self._dispatch()
        def do_DELETE(self):  self._dispatch()
        def do_OPTIONS(self): self._dispatch()

        def log_message(self, fmt, *args):
            pass  # keep Vercel function logs free of the default access-log noise

    return VercelHandler
