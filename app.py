"""
FedShield Render Production WSGI Application & Server (app.py).
Serves React SPA (dist/) and Python API (/api/*) via WSGI (gunicorn) or standalone HTTP server.
"""
import os
import sys
import json
import mimetypes
import importlib
from urllib.parse import urlparse, parse_qs

# Ensure root and api directory are in sys.path
sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "api"))

# Auto-load .env if present
env_file = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_file):
    try:
        with open(env_file, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k, v = k.strip(), v.strip().strip("'\"")
                    if k and not os.environ.get(k):
                        os.environ[k] = v
    except Exception:
        pass

ROUTES = {
    "/api/health":            "api.health",
    "/api/admin":             "api.admin",
    "/api/compare":           "api.compare",
    "/api/experiments":       "api.experiments",
    "/api/predict":           "api.predict",
    "/api/train":             "api.train",
    "/api/auth/signin":       "api.auth.signin",
    "/api/auth/signup":       "api.auth.signup",
    "/api/auth/signout":      "api.auth.signout",
    "/api/auth/me":           "api.auth.me",
    "/api/auth/callback":     "api.auth.callback",
    "/api/auth/google":       "api.auth.google",
    "/api/datasets/index":    "api.datasets.index",
    "/api/datasets/upload":   "api.datasets.upload",
    "/api/datasets/delete":   "api.datasets.delete",
    "/api/datasets/synthetic":"api.datasets.synthetic",
}

class _SimpleRequest:
    def __init__(self, method, headers, query, body, path=""):
        self.method  = method
        self.headers = headers
        self.query   = query
        self.body    = body
        self.path    = path

def app(environ, start_response):
    path = environ.get("PATH_INFO", "/").rstrip("/")
    if not path:
        path = "/"
    method = environ.get("REQUEST_METHOD", "GET")

    # 1. Health checks
    if path in ("/healthz", "/health", "/api/healthz"):
        start_response("200 OK", [
            ("Content-Type", "application/json"),
            ("Access-Control-Allow-Origin", "*")
        ])
        return [json.dumps({"status": "ok", "service": "FedShield API"}).encode("utf-8")]

    # 2. API Routes (/api/*)
    if path.startswith("/api"):
        mod_name = ROUTES.get(path)
        if not mod_name:
            start_response("404 Not Found", [
                ("Content-Type", "application/json"),
                ("Access-Control-Allow-Origin", "*")
            ])
            return [json.dumps({"error": f"API route '{path}' not found"}).encode("utf-8")]

        # Extract request headers
        headers = {}
        for k, v in environ.items():
            if k.startswith("HTTP_"):
                header_key = k[5:].replace("_", "-").title()
                headers[header_key] = v
            elif k in ("CONTENT_TYPE", "CONTENT_LENGTH"):
                header_key = k.replace("_", "-").title()
                headers[header_key] = v

        # Read body
        try:
            length = int(environ.get("CONTENT_LENGTH", 0) or 0)
        except ValueError:
            length = 0
        body = environ["wsgi.input"].read(length) if length > 0 else b""

        # Extract query parameters
        query = {k: v[0] for k, v in parse_qs(environ.get("QUERY_STRING", "")).items()}
        req = _SimpleRequest(method, headers, query, body, path=path)

        try:
            mod = importlib.import_module(mod_name)
            fn = getattr(mod, "_handler_impl")
            res = fn(req)
        except Exception as e:
            res = {
                "statusCode": 500,
                "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
                "body": json.dumps({"error": str(e)})
            }

        if not isinstance(res, dict):
            res = {
                "statusCode": 500,
                "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"},
                "body": json.dumps({"error": "Invalid handler response"})
            }

        raw_status = res.get("statusCode", 200)
        status_str = f"{raw_status} OK" if raw_status == 200 else f"{raw_status} Error"
        raw_headers = res.get("headers")
        resp_headers = [(str(k), str(v)) for k, v in raw_headers.items()] if isinstance(raw_headers, dict) else []

        if not any(k.lower() == "content-type" for k, _ in resp_headers):
            resp_headers.append(("Content-Type", "application/json"))
        if not any(k.lower() == "access-control-allow-origin" for k, _ in resp_headers):
            resp_headers.append(("Access-Control-Allow-Origin", "*"))

        raw_body = res.get("body", "")
        resp_body = raw_body.encode("utf-8") if isinstance(raw_body, str) else (raw_body if isinstance(raw_body, bytes) else b"")

        start_response(status_str, resp_headers)
        return [resp_body]

    # 3. Static Files & SPA Fallback (dist/)
    dist_dir = os.path.join(os.path.dirname(__file__), "dist")
    rel_path = path.lstrip("/")
    target_path = os.path.join(dist_dir, rel_path)

    if path != "/" and os.path.exists(target_path) and not os.path.isdir(target_path):
        mime_type, _ = mimetypes.guess_type(target_path)
        mime_type = mime_type or "application/octet-stream"
        try:
            with open(target_path, "rb") as f:
                content = f.read()
            start_response("200 OK", [
                ("Content-Type", mime_type),
                ("Content-Length", str(len(content)))
            ])
            return [content]
        except Exception:
            pass

    # Serve index.html for SPA routes
    index_path = os.path.join(dist_dir, "index.html")
    if os.path.exists(index_path):
        try:
            with open(index_path, "rb") as f:
                content = f.read()
            start_response("200 OK", [
                ("Content-Type", "text/html; charset=utf-8"),
                ("Content-Length", str(len(content)))
            ])
            return [content]
        except Exception as e:
            start_response("500 Internal Server Error", [("Content-Type", "text/plain")])
            return [f"Error reading index.html: {e}".encode("utf-8")]

    start_response("404 Not Found", [("Content-Type", "text/plain")])
    return [b"FedShield dist/index.html not found."]

if __name__ == "__main__":
    from http.server import HTTPServer
    import server
    port = int(os.environ.get("PORT", 10000))
    srv = HTTPServer(("0.0.0.0", port), server.RenderServerHandler)
    print(f"FedShield server running on http://0.0.0.0:{port}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
