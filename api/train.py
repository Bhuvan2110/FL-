"""
Training endpoint — runs all 5 FL algorithms server-side in Python.
Returns full result as JSON (Vercel serverless, no SSE streaming).
Frontend polls for progress via experiment status.
"""
import json, sys, os, random, io, csv
sys.path.insert(0, os.path.dirname(__file__))
try:
    from _shared import get_db, get_write_db, json_response, error_response, bearer_token, require_auth, log_audit, make_handler
    from core.encryption import encrypt_json, model_passphrase
    from ml.logistic import (
        to_xy, min_max_normalize, stratified_split,
        partition_clients, generate_synthetic_dataset
    )
    from ml.algorithms import (
        train_central, train_fedavg, train_fedprox,
        train_scaffold, train_krum, train_dpsgd, ALGORITHMS
    )
    from ml.metrics import classification_report, roc_curve, platt_scale
except ImportError:
    from api._shared import get_db, get_write_db, json_response, error_response, bearer_token, require_auth, log_audit, make_handler
    from api.core.encryption import encrypt_json, model_passphrase
    from api.ml.logistic import (
        to_xy, min_max_normalize, stratified_split,
        partition_clients, generate_synthetic_dataset
    )
    from api.ml.algorithms import (
        train_central, train_fedavg, train_fedprox,
        train_scaffold, train_krum, train_dpsgd, ALGORITHMS
    )
    from api.ml.metrics import classification_report, roc_curve, platt_scale


def _load_rows(db, dataset_id, user_id):
    ds = (
        db.from_("datasets")
        .select("*")
        .eq("id", dataset_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not ds.data:
        return None, None, None
    raw  = db.storage.from_("datasets").download(ds.data["storage_path"])
    text = raw.decode("utf-8")
    if ds.data["storage_path"].endswith(".json"):
        parsed = json.loads(text)
        return parsed["rows"], parsed["label_col"], ds.data
    reader = csv.DictReader(io.StringIO(text))
    rows = []
    for row in reader:
        p = {}
        for k, v in row.items():
            try:
                p[k] = float(v) if "." in str(v) else int(v)
            except Exception:
                p[k] = v
        rows.append(p)
    return rows, ds.data.get("label_col"), ds.data


@require_auth
def _handler_impl(request, user):
    if request.method == "OPTIONS":
        return json_response({})
    if request.method != "POST":
        return error_response("Method not allowed", 405)

    exp_id   = None
    token    = getattr(request, "token", "") or bearer_token(request)
    db       = get_db(token)        # user-scoped: for reads + storage
    write_db = get_write_db(token)  # service key: bypasses RLS for table writes

    try:
        body         = json.loads(request.body)
        dataset_id   = body.get("dataset_id", "")
        algorithm    = body.get("algorithm", "fedavg")
        rounds       = int(body.get("rounds", 20))
        lr           = float(body.get("lr", 0.4))
        local_epochs = int(body.get("local_epochs", 3))
        num_clients  = int(body.get("num_clients", 4))
        iid          = bool(body.get("iid", True))
        alpha        = float(body.get("alpha", 0.5)) if "alpha" in body else None
        mu           = float(body.get("mu", 0.01))
        clip_norm    = float(body.get("clip_norm", 1.0))
        noise_mult   = float(body.get("noise_multiplier", 1.1))
        delta        = float(body.get("delta", 1e-5))

        # Cap rounds for serverless time limit
        rounds = min(rounds, 30)

        # Load dataset
        rows, label_col, ds_meta = _load_rows(write_db, dataset_id, user.id)
        if rows is None:
            return error_response("Dataset not found", 404)

        label_str: str = str(label_col or "label")
        feature_cols = [c for c in rows[0].keys() if c != label_str]
        run_seed     = random.randint(1, 99999)

        norm_rows, norm_stats = min_max_normalize(rows, feature_cols)
        train, val, test      = stratified_split(norm_rows, label_str, seed=run_seed)

        # Create experiment record
        cfg = {**body, "run_seed": run_seed, "rounds": rounds}
        exp_resp = write_db.from_("experiments").insert({
            "user_id":    user.id,
            "dataset_id": dataset_id,
            "algorithm":  algorithm,
            "status":     "running",
            "config":     cfg,
        }).execute()
        exp_data = exp_resp.data[0] if (isinstance(exp_resp.data, list) and exp_resp.data and isinstance(exp_resp.data[0], dict)) else {}
        exp_id   = str(exp_data.get("id") or "")

        val_X,  val_y  = to_xy(val,  feature_cols, label_str)
        test_X, test_y = to_xy(test, feature_cols, label_str)

        # Collect round data
        round_buffer   = []
        privacy_buffer = []

        def on_round(r):
            round_buffer.append(r)
            if "epsilon" in r:
                privacy_buffer.append({"round": r["round"], "epsilon": r["epsilon"]})

        # Run algorithm
        result = None
        if algorithm == "central":
            X, y   = to_xy(train, feature_cols, label_str)
            result = train_central(X, y, val_X, val_y, rounds, lr, on_round=on_round)

        elif algorithm == "dpsgd":
            X, y   = to_xy(train, feature_cols, label_str)
            result = train_dpsgd(
                X, y, val_X, val_y, rounds, lr,
                clip_norm, noise_mult, delta, on_round=on_round
            )
        else:
            client_rows = partition_clients(train, label_str, num_clients, iid, run_seed, alpha=alpha)
            clients = []
            for cr in client_rows:
                cx, cy = to_xy(cr, feature_cols, label_str)
                clients.append({"X": cx, "y": cy})
            args = dict(
                clients=clients, val_X=val_X, val_y=val_y,
                rounds=rounds, local_epochs=local_epochs, lr=lr, on_round=on_round
            )
            if algorithm   == "fedavg":   result = train_fedavg(**args)
            elif algorithm == "fedprox":  result = train_fedprox(**args, mu=mu)
            elif algorithm == "scaffold": result = train_scaffold(**args)
            elif algorithm == "krum":     result = train_krum(**args)

        # Persist rounds
        round_inserts = [
            {"experiment_id": exp_id, "round_num": r["round"],
             "loss": r["loss"], "accuracy": r["accuracy"]}
            for r in round_buffer
        ]
        if round_inserts:
            write_db.from_("rounds").insert(round_inserts).execute()

        # Persist privacy budget
        priv_inserts = [
            {"experiment_id": exp_id, "round_num": p["round"],
             "epsilon": p["epsilon"], "delta": delta}
            for p in privacy_buffer
        ]
        if priv_inserts:
            write_db.from_("privacy_budget").insert(priv_inserts).execute()

        # Evaluate
        if not isinstance(result, dict) or "weights" not in result:
            return error_response("Training failed to produce weights", 500)

        report = classification_report(result["weights"], test_X, test_y)
        roc    = roc_curve(result["weights"], test_X, test_y)

        w          = result["weights"]
        raw_scores = [
            sum(w["w"][j] * test_X[i][j] for j in range(len(w["w"]))) + w["b"]
            for i in range(len(test_X))
        ]
        platt = platt_scale(raw_scores, test_y)

        write_db.from_("metrics").insert({
            "experiment_id":   exp_id,
            "model_label":     algorithm,
            "accuracy":        report["accuracy"],
            "f1":              report["f1"],
            "auc":             roc["auc"],
            "precision_score": report["precision"],
            "recall":          report["recall"],
        }).execute()

        # Encrypt weights
        passphrase = model_passphrase(user.id, exp_id)
        ct, iv = encrypt_json({
            "weights":      result["weights"],
            "feature_cols": feature_cols,
            "label_col":    label_col,
            "norm_stats":   norm_stats,
            "platt":        platt,
        }, passphrase)

        write_db.from_("models").insert({
            "experiment_id":     exp_id,
            "encrypted_weights": ct,
            "iv":                iv,
            "version":           1,
        }).execute()

        # Complete
        write_db.from_("experiments").update({
            "status":       "completed",
            "completed_at": "now()",
        }).eq("id", exp_id).execute()

        log_audit(user.id, "experiment_complete", algorithm,
                  {"accuracy": report["accuracy"], "experiment_id": exp_id}, token=token)

        # Convergence speed calculation
        max_acc = max((r["accuracy"] for r in round_buffer), default=0.0)
        target_acc = 0.8 * max_acc
        conv_round = None
        for r in round_buffer:
            if r["accuracy"] >= target_acc and target_acc > 0:
                conv_round = r["round"]
                break
        area_acc = round(sum(r["accuracy"] for r in round_buffer), 4)

        return json_response({
            "experiment_id": exp_id,
            "algorithm":     algorithm,
            "status":        "completed",
            "metrics":       {**report, "auc": roc["auc"], "conv_round": conv_round, "area_acc": area_acc},
            "roc":           roc["points"][:20],
            "privacy":       privacy_buffer,
            "history":       round_buffer,
        })

    except Exception as e:
        if exp_id:
            try:
                write_db.from_("experiments").update({"status": "failed"}).eq("id", exp_id).execute()
            except Exception:
                pass
        return error_response(str(e), 500)


# Vercel Python runtime entrypoint (class-based, required — see _shared.make_handler)
handler = make_handler(_handler_impl)
