"""
Shared helpers used by all Vercel Python API functions.
Vercel serverless: each /api/*.py file is one function, no FastAPI needed.
"""
import os, json
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from supabase import create_client

# Auto-load .env file from project root if present
_env_file = os.path.join(os.path.dirname(__file__), "..", ".env")
if os.path.exists(_env_file):
    try:
        with open(_env_file, "r", encoding="utf-8") as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and not _line.startswith("#") and "=" in _line:
                    _k, _v = _line.split("=", 1)
                    _k, _v = _k.strip(), _v.strip().strip("'\"")
                    if _k and not os.environ.get(_k):
                        os.environ[_k] = _v
    except Exception:
        pass

SUPABASE_URL              = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY         = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
ENCRYPTION_SECRET         = os.environ.get("ENCRYPTION_SECRET", "fedshield-aes-secret-key-32chars!!")
FRONTEND_URL              = os.environ.get("FRONTEND_URL", "https://fedshield-fl.vercel.app")


from typing import Optional, Dict, Any

def get_db(token: Optional[str] = None):
    if not SUPABASE_URL:
        raise ValueError("SUPABASE_URL is missing in project configuration.")
    key = SUPABASE_ANON_KEY
    # If anon key is not formatted as standard JWT (e.g. newer sb_publishable_* format),
    # use SUPABASE_SERVICE_ROLE_KEY to avoid supabase-py client initialization exception.
    if not (key and "." in key):
        key = SUPABASE_SERVICE_ROLE_KEY or key
    if not key:
        raise ValueError("Supabase API key is missing in project configuration.")
    client = create_client(SUPABASE_URL, key)
    if token:
        client.postgrest.auth(token)
    return client


def get_service_db():
    """Return a Supabase client using the service role key (bypasses RLS).
    Returns None if SUPABASE_SERVICE_ROLE_KEY is not configured.
    Explicitly sets the Authorization header on the postgrest session so that
    Supabase Python v2 actually sends the service role JWT and bypasses RLS."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None
    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    # Explicitly inject service key as the bearer token so postgrest
    # sends Authorization: Bearer <service_role_key> and bypasses RLS.
    client.postgrest.auth(SUPABASE_SERVICE_ROLE_KEY)
    return client


def get_write_db(token: Optional[str] = None):
    """Return the best available client for write operations (INSERT/UPDATE/DELETE).
    Prefers the service role key (bypasses RLS); falls back to the user-scoped
    anon client when the service key is not configured."""
    db = get_service_db()
    if db is None:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is missing from the backend environment.")
    return db


def get_user(token: str):
    """Validate Supabase JWT and return the user object."""
    try:
        db = get_service_db() or get_db(token)
        resp = db.auth.get_user(token)
        if not resp or not resp.user:
            return None
        return resp.user
    except Exception:
        return None


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
        request.token = token
        return handler(request, user)
    return wrapper


def get_profile(user_id: str, token: Optional[str] = None) -> Dict[str, Any]:
    db = get_db(token)
    resp = db.from_("profiles").select("*").eq("id", user_id).single().execute()
    data = resp.data if isinstance(resp.data, dict) else {}
    return data


def is_admin(user_id: str, token: Optional[str] = None) -> bool:
    profile = get_profile(user_id, token)
    return profile.get("role") in ("admin", "super_admin")


def log_audit(user_id: str, action: str, resource: str = "", detail: Optional[dict] = None, token: Optional[str] = None):
    """Write an audit log entry. Uses service role key to bypass RLS if available,
    otherwise falls back to the user-scoped anon client."""
    try:
        db = get_service_db() or get_db(token)
        db.from_("audit_logs").insert({
            "user_id":  user_id,
            "action":   action,
            "resource": resource,
            "detail":   detail or {},
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

            if not isinstance(result, dict):
                result = error_response("Internal Server Error: Invalid handler response", 500)

            raw_status = result.get("statusCode", 200)
            status = int(raw_status) if isinstance(raw_status, (int, str)) and str(raw_status).isdigit() else 200
            raw_headers = result.get("headers")
            resp_headers: Dict[str, str] = {str(k): str(v) for k, v in raw_headers.items()} if isinstance(raw_headers, dict) else {}
            raw_body = result.get("body", "")
            resp_body: bytes = raw_body.encode("utf-8") if isinstance(raw_body, str) else (raw_body if isinstance(raw_body, bytes) else b"")

            if not any(k.lower() == "content-type" for k in resp_headers):
                resp_headers["Content-Type"] = "application/json"

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

        def log_message(self, format, *args):
            pass  # keep Vercel function logs free of the default access-log noise

    return VercelHandler
