import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from _shared import get_db, json_response, error_response, require_auth, make_handler


@require_auth
def _handler_impl(request, user):
    if request.method == "OPTIONS":
        return json_response({})

    db = get_db()

    # GET /api/experiments?rounds=<exp_id>  → return rounds for that experiment
    exp_id = request.query.get("rounds", "")
    if exp_id:
        exp = db.from_("experiments").select("user_id").eq("id", exp_id).single().execute()
        if not exp.data or exp.data["user_id"] != user.id:
            return error_response("Not authorised", 403)
        resp = (
            db.from_("rounds")
            .select("*")
            .eq("experiment_id", exp_id)
            .order("round_num")
            .execute()
        )
        return json_response({"rounds": resp.data or []})

    # GET /api/experiments  → list all experiments for user
    try:
        resp = (
            db.from_("experiments")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", desc=True)
            .execute()
        )
        return json_response({"experiments": resp.data or []})
    except Exception as e:
        return error_response(str(e), 500)


# Vercel Python runtime entrypoint (class-based, required — see _shared.make_handler)
handler = make_handler(_handler_impl)
