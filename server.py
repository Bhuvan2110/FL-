"""
FedShield Render Web Server.
Serves Python API (/api/*) and Vite React SPA (dist/) on a single port for Render deployment.
"""
import os
import sys
import json
import mimetypes
import importlib
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# Ensure root and api directory are in sys.path
sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "api"))

# Auto-load .env
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

class RenderServerHandler(BaseHTTPRequestHandler):
    def _serve_file(self, filepath, content_type=None):
        if not os.path.exists(filepath) or os.path.isdir(filepath):
            return False
        if not content_type:
            content_type, _ = mimetypes.guess_type(filepath)
            content_type = content_type or "application/octet-stream"
        
        try:
            with open(filepath, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return True
        except Exception:
            return False

    def _dispatch_api(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")
        mod_name = ROUTES.get(path)
        
        if not mod_name:
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": f"API route '{path}' not found"}).encode())
            return

        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
        except ValueError:
            length = 0
        body = self.rfile.read(length) if length else b""
        query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        req = _SimpleRequest(self.command, self.headers, query, body, path=self.path)

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
            res = {"statusCode": 500, "headers": {"Content-Type": "application/json", "Access-Control-Allow-Origin": "*"}, "body": json.dumps({"error": "Invalid handler response"})}

        raw_status = res.get("statusCode", 200)
        status = int(raw_status) if isinstance(raw_status, (int, str)) and str(raw_status).isdigit() else 200
        raw_headers = res.get("headers")
        resp_headers = {str(k): str(v) for k, v in raw_headers.items()} if isinstance(raw_headers, dict) else {}
        raw_body = res.get("body", "")
        resp_body = raw_body.encode("utf-8") if isinstance(raw_body, str) else (raw_body if isinstance(raw_body, bytes) else b"")

        if not any(k.lower() == "content-type" for k in resp_headers):
            resp_headers["Content-Type"] = "application/json"
        if not any(k.lower() == "access-control-allow-origin" for k in resp_headers):
            resp_headers["Access-Control-Allow-Origin"] = "*"

        self.send_response(status)
        for k, v in resp_headers.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(resp_body)

    def _handle_request(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # Direct Health Check Routes for Render / Monitoring
        if path in ("/healthz", "/health", "/api/healthz"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "service": "FedShield API"}).encode())
            return

        if path.startswith("/api/"):
            self._dispatch_api()
            return

        # Serve static assets or fallback to dist/index.html (SPA)
        dist_dir = os.path.join(os.path.dirname(__file__), "dist")
        rel_path = path.lstrip("/")
        target_path = os.path.join(dist_dir, rel_path)

        if path != "/" and os.path.exists(target_path) and not os.path.isdir(target_path):
            if self._serve_file(target_path):
                return

        # Fallback to SPA index.html
        index_path = os.path.join(dist_dir, "index.html")
        if os.path.exists(index_path):
            self._serve_file(index_path, content_type="text/html")
        else:
            self.send_response(404)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"Dist folder not found. Please run 'npm run build' first.")

    def do_GET(self):     self._handle_request()
    def do_POST(self):    self._handle_request()
    def do_PUT(self):     self._handle_request()
    def do_PATCH(self):   self._handle_request()
    def do_DELETE(self):  self._handle_request()
    def do_OPTIONS(self): self._handle_request()

    def log_message(self, format, *args):
        pass

if __name__ == "__main__":
    dist_dir = os.path.join(os.path.dirname(__file__), "dist")
    index_path = os.path.join(dist_dir, "index.html")
    if not os.path.exists(index_path):
        print("dist/index.html not found. Running frontend build (npm install && npm run build)...")
        try:
            import subprocess
            subprocess.run("npm install && npm run build", shell=True, check=True)
            print("Frontend build succeeded!")
        except Exception as err:
            print(f"Warning: Frontend build error: {err}")

    port = int(os.environ.get("PORT", 10000))
    server = HTTPServer(("0.0.0.0", port), RenderServerHandler)
    print(f"FedShield Render server running on http://0.0.0.0:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass

