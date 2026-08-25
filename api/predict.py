import json, sys, os, hashlib, math
sys.path.insert(0, os.path.dirname(__file__))
try:
    from _shared import get_db, get_write_db, json_response, error_response, bearer_token, require_auth, log_audit, make_handler
    from core.encryption import decrypt_json, model_passphrase
    from ml.logistic import apply_min_max, predict_proba, dot
except ImportError:
    from api._shared import get_db, get_write_db, json_response, error_response, bearer_token, require_auth, log_audit, make_handler
    from api.core.encryption import decrypt_json, model_passphrase
    from api.ml.logistic import apply_min_max, predict_proba, dot


def _load_model(db, experiment_id, user_id):
    exp = (
        db.from_("experiments")
        .select("user_id, status")
        .eq("id", experiment_id)
        .single()
        .execute()
    )
    if not exp.data:
        return None, "Experiment not found"
    if exp.data["user_id"] != user_id:
        return None, "Not authorised"
    if exp.data["status"] != "completed":
        return None, "Experiment not yet completed"

    model = (
        db.from_("models")
        .select("*")
        .eq("experiment_id", experiment_id)
        .order("version", desc=True)
        .limit(1)
        .single()
        .execute()
    )
    if not model.data:
        return None, "No model found"

    passphrase = model_passphrase(user_id, experiment_id)
    payload    = decrypt_json(model.data["encrypted_weights"], model.data["iv"], passphrase)
    return payload, None


def _score(payload, features):
    feature_cols = payload["feature_cols"]
    norm_stats   = payload["norm_stats"]
    weights      = payload["weights"]
    platt        = payload.get("platt", {"A": 1.0, "B": 0.0})

    x         = apply_min_max(features, feature_cols, norm_stats)
    raw_score = dot(weights["w"], x) + weights["b"]
    raw_proba = predict_proba(weights, x)
    confidence = 1 / (1 + math.exp(platt["A"] * raw_score + platt["B"]))
    output    = 1 if raw_proba >= 0.5 else 0
    return {"output": output, "confidence": round(confidence, 4), "raw_score": round(raw_score, 6)}


def _hash_input(features):
    return hashlib.sha256(json.dumps(features, sort_keys=True).encode()).hexdigest()


@require_auth
def _handler_impl(request, user):
    if request.method == "OPTIONS":
        return json_response({})
    if request.method != "POST":
        return error_response("Method not allowed", 405)

    try:
        body          = json.loads(request.body)
        experiment_id = body.get("experiment_id", "")
        mode          = body.get("mode", "single")   # "single" or "batch"

        token    = getattr(request, "token", "") or bearer_token(request)
        db       = get_db(token)        # user-scoped: for reads
        write_db = get_write_db(token)  # service key: bypasses RLS for predictions insert
        payload, err = _load_model(db, experiment_id, user.id)
        if err:
            return error_response(err, 404)

        model_row = (
            db.from_("models")
            .select("id")
            .eq("experiment_id", experiment_id)
            .limit(1)
            .single()
            .execute()
        )
        model_data = model_row.data if isinstance(model_row.data, dict) else {}
        model_id   = str(model_data["id"]) if "id" in model_data else None

        if mode == "batch":
            rows    = body.get("rows", [])
            results = []
            inserts = []
            for i, row in enumerate(rows):
                r = _score(payload, row)
                results.append({**row, **r, "row_index": i})
                if model_id:
                    inserts.append({
                        "model_id":   model_id,
                        "user_id":    user.id,
                        "input_hash": _hash_input(row),
                        "input":      row,
                        "output":     r["output"],
                        "confidence": r["confidence"],
                    })
            if inserts:
                write_db.from_("predictions").insert(inserts).execute()
            log_audit(user.id, "predict_batch", experiment_id, {"count": len(results)})
            return json_response({"results": results, "count": len(results)})

        else:
            features = body.get("features", {})
            result   = _score(payload, features)
            if model_id:
                write_db.from_("predictions").insert({
                    "model_id":   model_id,
                    "user_id":    user.id,
                    "input_hash": _hash_input(features),
                    "input":      features,
                    "output":     result["output"],
                    "confidence": result["confidence"],
                }).execute()
            log_audit(user.id, "predict_single", experiment_id, {"output": result["output"]})
            return json_response({**result, "experiment_id": experiment_id})

    except Exception as e:
        return error_response(str(e), 500)


# Vercel Python runtime entrypoint (class-based, required — see _shared.make_handler)
handler = make_handler(_handler_impl)
