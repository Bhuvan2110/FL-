import json, sys, os, random
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
try:
    from _shared import get_db, get_write_db, json_response, error_response, bearer_token, require_auth, log_audit, make_handler
    from ml.logistic import generate_synthetic_dataset, min_max_normalize
except ImportError:
    from api._shared import get_db, get_write_db, json_response, error_response, bearer_token, require_auth, log_audit, make_handler
    from api.ml.logistic import generate_synthetic_dataset, min_max_normalize


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
def _handler_impl(request, user):
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

        token = getattr(request, "token", "") or bearer_token(request)
        write_db = get_write_db(token)    # service key: bypasses RLS for both storage and table writes
        storage_path = f"{user.id}/{filename}"
        raw_bytes = json.dumps(ds).encode()
        # Use service role client for storage too — bypasses Storage bucket RLS policies
        write_db.storage.from_("datasets").upload(
            storage_path, raw_bytes,
            {"content-type": "application/json", "upsert": "true"}
        )

        resp = write_db.from_("datasets").insert({
            "user_id":      user.id,
            "filename":     filename,
            "storage_path": storage_path,
            "cols":         col_profile,
            "label_col":    ds["label_col"],
            "rows_count":   len(ds["rows"]),
            "is_synthetic": True,
        }).execute()

        log_audit(user.id, "dataset_generate", filename, {"rows": len(ds["rows"]), "seed": seed}, token=token)

        dataset_row = resp.data[0] if (isinstance(resp.data, list) and resp.data and isinstance(resp.data[0], dict)) else {}

        return json_response({
            "dataset":   dataset_row,
            "preview":   ds["rows"][:8],
            "cols":      ds["cols"],
            "label_col": ds["label_col"],
        })
    except Exception as e:
        return error_response(str(e), 500)


# Vercel Python runtime entrypoint (class-based, required — see _shared.make_handler)
handler = make_handler(_handler_impl)
