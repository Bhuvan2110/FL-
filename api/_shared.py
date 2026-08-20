"""
Shared helpers used by all Vercel Python API functions.
Vercel serverless: each /api/*.py file is one function, no FastAPI needed.
"""
import os, json
from http.server import BaseHTTPRequestHandler
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
