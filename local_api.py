"""
Local Python API Server for FedShield.
Routes /api/* endpoints to python serverless functions during local dev.
"""
import os, sys, json, importlib, site
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# Include user site-packages
for p in [site.getusersitepackages(), site.getsitepackages()]:
    if isinstance(p, str) and os.path.exists(p) and p not in sys.path:
        sys.path.insert(0, p)

# Auto-load .env
env_file = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_file):
    with open(env_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                k, v = k.strip(), v.strip().strip("'\"")
                if k and not os.environ.get(k):
                    os.environ[k] = v

sys.path.insert(0, os.path.dirname(__file__))

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


class LocalApiHandler(BaseHTTPRequestHandler):
    def _dispatch(self):
        parsed   = urlparse(self.path)
        path     = parsed.path
        mod_name = ROUTES.get(path)
        if not mod_name:
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error": "API route not found"}')
            return

        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
        except ValueError:
            length = 0
        body  = self.rfile.read(length) if length else b""
        query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
        req   = _SimpleRequest(self.command, self.headers, query, body, path=path)

        try:
            for s in list(sys.modules.keys()):
                if s.startswith("api.") or s in ("_shared", "ml", "core"):
                    try:
                        importlib.reload(sys.modules[s])
                    except Exception:
                        pass
            mod = importlib.import_module(mod_name)
            mod = importlib.reload(mod)
            fn  = getattr(mod, "_handler_impl")
            res = fn(req)
        except Exception as e:
            import traceback
            traceback.print_exc()
            res = {
                "statusCode": 500,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": str(e)})
            }

        if not isinstance(res, dict):
            res = {"statusCode": 500, "headers": {"Content-Type": "application/json"}, "body": json.dumps({"error": "Invalid handler response"})}

        raw_status = res.get("statusCode", 200)
        status = int(raw_status) if isinstance(raw_status, (int, str)) and str(raw_status).isdigit() else 200
        raw_headers = res.get("headers")
        resp_headers: dict[str, str] = {str(k): str(v) for k, v in raw_headers.items()} if isinstance(raw_headers, dict) else {}
        raw_body = res.get("body", "")
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
        pass


if __name__ == "__main__":
    port = 8000
    server = HTTPServer(("127.0.0.1", port), LocalApiHandler)
    print(f"Local Python API server running on http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
