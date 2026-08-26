"""
FedShield Render Entrypoint Fallback (app.py).
Provides compatibility for default Render deployments running 'gunicorn app:app' or 'python app.py'.
"""
import os
import sys
import subprocess

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "api"))

import server

def app(environ, start_response):
    path = environ.get("PATH_INFO", "/")
    if path in ("/healthz", "/health", "/api/healthz"):
        start_response("200 OK", [("Content-Type", "application/json"), ("Access-Control-Allow-Origin", "*")])
        return [b'{"status": "ok", "service": "FedShield API"}']

    start_response("200 OK", [("Content-Type", "text/html; charset=utf-8")])
    dist_dir = os.path.join(os.path.dirname(__file__), "dist")
    index_path = os.path.join(dist_dir, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "rb") as f:
            return [f.read()]
    return [b"FedShield server active."]

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    dist_dir = os.path.join(os.path.dirname(__file__), "dist")
    if not os.path.exists(os.path.join(dist_dir, "index.html")):
        try:
            subprocess.run("npm install && npm run build", shell=True, check=True)
        except Exception as e:
            print(f"Warning: {e}")

    srv = server.HTTPServer(("0.0.0.0", port), server.RenderServerHandler)
    print(f"FedShield server starting on 0.0.0.0:{port}...")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
