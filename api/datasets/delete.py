import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from _shared import get_db, json_response, error_response, require_auth, log_audit


@require_auth
def handler(request, user):
    if request.method == "OPTIONS":
        return json_response({})
    if request.method != "DELETE":
        return error_response("Method not allowed", 405)
    try:
        dataset_id = request.query.get("id", "")
        if not dataset_id:
            return error_response("Missing dataset id")

        db = get_db()
        ds = (
            db.from_("datasets")
            .select("*")
            .eq("id", dataset_id)
            .eq("user_id", user.id)
            .single()
            .execute()
        )
        if not ds.data:
            return error_response("Dataset not found", 404)

        if ds.data.get("storage_path"):
            db.storage.from_("datasets").remove([ds.data["storage_path"]])

        db.from_("datasets").delete().eq("id", dataset_id).execute()
        log_audit(user.id, "dataset_delete", ds.data["filename"])
        return json_response({"deleted": True})
    except Exception as e:
        return error_response(str(e), 500)
