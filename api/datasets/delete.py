import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
try:
    from _shared import get_db, get_write_db, json_response, error_response, bearer_token, require_auth, log_audit, make_handler
except ImportError:
    from api._shared import get_db, get_write_db, json_response, error_response, bearer_token, require_auth, log_audit, make_handler


@require_auth
def _handler_impl(request, user):
    if request.method == "OPTIONS":
        return json_response({})
    if request.method != "DELETE":
        return error_response("Method not allowed", 405)
    try:
        dataset_id = request.query.get("id", "")
        if not dataset_id:
            return error_response("Missing dataset id")

        token = getattr(request, "token", "") or bearer_token(request)
        db = get_write_db(token)
        ds = (
            db.from_("datasets")
            .select("*")
            .eq("id", dataset_id)
            .eq("user_id", user.id)
            .single()
            .execute()
        )
        ds_data = ds.data if isinstance(ds.data, dict) else {}
        if not ds_data:
            return error_response("Dataset not found", 404)

        storage_path = str(ds_data.get("storage_path") or "")
        filename     = str(ds_data.get("filename") or "")

        if storage_path:
            db.storage.from_("datasets").remove([storage_path])

        db.from_("datasets").delete().eq("id", dataset_id).execute()
        log_audit(user.id, "dataset_delete", filename, token=token)
        return json_response({"deleted": True})
    except Exception as e:
        return error_response(str(e), 500)


# Vercel Python runtime entrypoint (class-based, required — see _shared.make_handler)
handler = make_handler(_handler_impl)
