import json, sys, os, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from _shared import get_db, json_response, error_response, require_auth, log_audit
sys.path.insert(0, os.path.dirname(__file__))
from ml.logistic import generate_synthetic_dataset, min_max_normalize


def _profile_columns(cols, rows):
    result = []
    for c in cols:
        vals = [r.get(c) for r in rows if r.get(c) is not None]
        numeric = all(isinstance(v, (int, float)) for v in vals)
        result.append({
            "name": c,
            "dtype": "numeric" if numeric else "categorical",
            "missingPct": 0,
            "unique": len(set(str(v) for v in vals)),
        })
    return result


@require_auth
def handler(request, user):
    if request.method == "OPTIONS":
        return json_response({})
    if request.method != "POST":
        return error_response("Method not allowed", 405)
    try:
        body       = json.loads(request.body) if request.body else {}
        n_rows     = int(body.get("n_rows", 600))
        n_features = int(body.get("n_features", 5))
        seed       = body.get("seed") or random.randint(1, 99999)

        ds = generate_synthetic_dataset(n_rows, n_features, seed)
        col_profile = _profile_columns(ds["cols"], ds["rows"])
        filename = f"synthetic_{seed}.json"

        db = get_db()
        storage_path = f"{user.id}/{filename}"
        raw_bytes = json.dumps(ds).encode()
        db.storage.from_("datasets").upload(
            storage_path, raw_bytes,
            {"content-type": "application/json", "upsert": "true"}
        )

        resp = db.from_("datasets").insert({
            "user_id":      user.id,
            "filename":     filename,
            "storage_path": storage_path,
            "cols":         col_profile,
            "label_col":    ds["label_col"],
            "rows_count":   len(ds["rows"]),
            "is_synthetic": True,
        }).execute()

        log_audit(user.id, "dataset_generate", filename, {"rows": len(ds["rows"]), "seed": seed})

        return json_response({
            "dataset":   resp.data[0],
            "preview":   ds["rows"][:8],
            "cols":      ds["cols"],
            "label_col": ds["label_col"],
        })
    except Exception as e:
        return error_response(str(e), 500)
