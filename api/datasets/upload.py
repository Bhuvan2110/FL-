import sys, os, io, csv, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
try:
    from _shared import get_db, get_write_db, json_response, error_response, bearer_token, require_auth, log_audit, make_handler
except ImportError:
    from api._shared import get_db, get_write_db, json_response, error_response, bearer_token, require_auth, log_audit, make_handler


def _profile_columns(cols, rows):
    result = []
    for c in cols:
        vals = [r.get(c) for r in rows if r.get(c) is not None]
        numeric = all(isinstance(v, (int, float)) for v in vals)
        result.append({
            "name": c,
            "dtype": "numeric" if numeric else "categorical",
            "missingPct": round((len(rows) - len(vals)) / len(rows) * 100, 1) if rows else 0,
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
        # Vercel passes file body as bytes
        content = request.body if isinstance(request.body, bytes) else request.body.encode()
        decoded = content.decode("utf-8", errors="replace")
        reader  = csv.DictReader(io.StringIO(decoded))
        rows = []
        for row in reader:
            parsed = {}
            for k, v in row.items():
                try:
                    parsed[k] = float(v) if "." in str(v) else int(v)
                except (ValueError, TypeError):
                    parsed[k] = v
            rows.append(parsed)

        if not rows:
            return error_response("CSV is empty or could not be parsed")

        cols      = list(rows[0].keys())
        label_col = "label" if "label" in cols else cols[-1]
        filename  = request.headers.get("x-filename", "upload.csv")

        token = getattr(request, "token", "") or bearer_token(request)
        write_db = get_write_db(token)    # service key: bypasses RLS for both storage and table writes
        storage_path = f"{user.id}/{filename}"
        write_db.storage.from_("datasets").upload(
            storage_path, content,
            {"content-type": "text/csv", "upsert": "true"}
        )

        resp = write_db.from_("datasets").insert({
            "user_id":      user.id,
            "filename":     filename,
            "storage_path": storage_path,
            "cols":         _profile_columns(cols, rows),
            "label_col":    label_col,
            "rows_count":   len(rows),
            "is_synthetic": False,
        }).execute()

        log_audit(user.id, "dataset_upload", filename, {"rows": len(rows)}, token=token)

        dataset_row = resp.data[0] if (isinstance(resp.data, list) and resp.data and isinstance(resp.data[0], dict)) else {}

        return json_response({
            "dataset":   dataset_row,
            "preview":   rows[:8],
            "cols":      cols,
            "label_col": label_col,
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return error_response(str(e), 500)


# Vercel Python runtime entrypoint (class-based, required — see _shared.make_handler)
handler = make_handler(_handler_impl)
