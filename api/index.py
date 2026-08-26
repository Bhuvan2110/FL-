import sys, os, importlib
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

try:
    from _shared import make_handler, json_response, error_response
except ImportError:
    from api._shared import make_handler, json_response, error_response

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

def _router_handler(request):
    if request.method == "OPTIONS":
        return json_response({})

    path = getattr(request, "path", "") or ""
    parsed_path = urlparse(path).path.rstrip("/")
    if not parsed_path:
        parsed_path = "/api/health"

    mod_name = ROUTES.get(parsed_path)
    if not mod_name:
        return error_response(f"API route '{parsed_path}' not found", 404)

    try:
        mod = importlib.import_module(mod_name)
        fn = getattr(mod, "_handler_impl", None)
        if not fn:
            return error_response(f"Handler implementation not found for '{parsed_path}'", 500)
        return fn(request)
    except Exception as e:
        return error_response(str(e), 500)

handler = make_handler(_router_handler)
