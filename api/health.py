import sys, os, time
sys.path.insert(0, os.path.dirname(__file__))
from _shared import get_db, json_response, error_response, require_auth, log_audit
from core.encryption import encrypt_json, decrypt_json, model_passphrase
from ml.logistic import (
    init_weights, gradient_step, cross_entropy_loss, accuracy,
    generate_synthetic_dataset, min_max_normalize, stratified_split, to_xy,
)
from ml.algorithms import train_central, train_fedavg
from ml.metrics import confusion_matrix, roc_curve


def _run(test_id, name, group, fn):
    t0 = time.perf_counter()
    try:
        msg = fn()
        return {"test_id": test_id, "name": name, "group": group,
                "status": "pass", "message": msg,
                "duration_ms": round((time.perf_counter() - t0) * 1000, 1)}
    except Exception as e:
        return {"test_id": test_id, "name": name, "group": group,
                "status": "fail", "message": str(e),
                "duration_ms": round((time.perf_counter() - t0) * 1000, 1)}


@require_auth
def handler(request, user):
    if request.method == "OPTIONS":
        return json_response({})

    # Ping
    if request.query.get("ping") == "true":
        return json_response({"status": "ok", "service": "FedShield API"})

    db = get_db()

    def test_db_connect():
        db.from_("profiles").select("id").limit(1).execute()
        return "Supabase REST API reachable"

    def test_db_write():
        db.from_("audit_logs").insert({
            "user_id": user.id, "action": "health_check",
            "resource": "health", "detail": {"ts": time.time()},
        }).execute()
        return "Audit log write succeeded"

    def test_rls():
        resp   = db.from_("profiles").select("id").execute()
        rows   = resp.data or []
        foreign = [r for r in rows if r["id"] != user.id]
        if foreign:
            raise AssertionError(f"RLS leaked {len(foreign)} foreign row(s)")
        return "RLS isolated — 0 foreign rows visible"

    def test_aes():
        payload = {"w": [1.23, -0.45, 0.89], "b": 0.02}
        ct, iv  = encrypt_json(payload, "test-key-fedshield")
        import json as _json
        rec = decrypt_json(ct, iv, "test-key-fedshield")
        if _json.dumps(rec, sort_keys=True) != _json.dumps(payload, sort_keys=True):
            raise AssertionError("Decrypted payload mismatch")
        return f"AES-256-GCM: {len(ct)} chars encrypted → decrypted OK"

    def test_wrong_key():
        ct, iv = encrypt_json({"x": 1}, "correct")
        try:
            decrypt_json(ct, iv, "wrong")
            raise AssertionError("Should have failed")
        except AssertionError:
            raise
        except Exception:
            pass
        return "Wrong-key correctly rejected"

    def test_passphrase():
        p1 = model_passphrase("u1", "e1")
        p2 = model_passphrase("u2", "e1")
        if p1 == p2:
            raise AssertionError("Passphrases must differ per user")
        return "Per-user passphrase isolation OK"

    def test_gradient():
        X  = [[1, 0], [0, 1], [1, 1], [0, 0]]
        y  = [1, 0, 1, 0]
        w0 = init_weights(2)
        l0 = cross_entropy_loss(w0, X, y)
        w1 = gradient_step(w0, X, y, 0.5)
        l1 = cross_entropy_loss(w1, X, y)
        if l1 >= l0:
            raise AssertionError(f"Loss did not decrease: {l0:.4f} → {l1:.4f}")
        return f"Loss decreased: {l0:.4f} → {l1:.4f}"

    def test_central():
        ds = generate_synthetic_dataset(500, 4, 42)
        fc = [c for c in ds["cols"] if c != ds["label_col"]]
        nr, _ = min_max_normalize(ds["rows"], fc)
        tr, vl, _ = stratified_split(nr, ds["label_col"])
        X, y   = to_xy(tr, fc, ds["label_col"])
        vX, vY = to_xy(vl, fc, ds["label_col"])
        r = train_central(X, y, vX, vY, rounds=40, lr=0.6)
        acc = accuracy(r["weights"], vX, vY)
        if acc < 0.60:
            raise AssertionError(f"Accuracy {acc*100:.1f}% < 60%")
        return f"Central converged — {acc*100:.1f}%"

    def test_fedavg():
        ds = generate_synthetic_dataset(300, 4, 7)
        fc = [c for c in ds["cols"] if c != ds["label_col"]]
        nr, _ = min_max_normalize(ds["rows"], fc)
        tr, vl, _ = stratified_split(nr, ds["label_col"])
        vX, vY = to_xy(vl, fc, ds["label_col"])
        clients = [
            {"X": to_xy([r for j, r in enumerate(tr) if j % 3 == i], fc, ds["label_col"])[0],
             "y": to_xy([r for j, r in enumerate(tr) if j % 3 == i], fc, ds["label_col"])[1]}
            for i in range(3)
        ]
        r = train_fedavg(clients, vX, vY, rounds=10, local_epochs=2, lr=0.4)
        acc = accuracy(r["weights"], vX, vY)
        if acc < 0.55:
            raise AssertionError(f"FedAvg {acc*100:.1f}% < 55%")
        return f"FedAvg converged — {acc*100:.1f}%"

    def test_cm():
        ds = generate_synthetic_dataset(100, 3, 42)
        fc = [c for c in ds["cols"] if c != ds["label_col"]]
        nr, _ = min_max_normalize(ds["rows"], fc)
        X, y = to_xy(nr, fc, ds["label_col"])
        w = init_weights(len(fc))
        for _ in range(10):
            w = gradient_step(w, X, y, 0.3)
        cm    = confusion_matrix(w, X, y)
        total = sum(cm.values())
        if total != len(X):
            raise AssertionError(f"CM sum {total} ≠ {len(X)}")
        return f"TP={cm['tp']} TN={cm['tn']} FP={cm['fp']} FN={cm['fn']} sum={total}"

    def test_auc():
        ds = generate_synthetic_dataset(200, 4, 99)
        fc = [c for c in ds["cols"] if c != ds["label_col"]]
        nr, _ = min_max_normalize(ds["rows"], fc)
        tr, ts, _ = stratified_split(nr, ds["label_col"])
        X, y   = to_xy(tr, fc, ds["label_col"])
        tX, tY = to_xy(ts, fc, ds["label_col"])
        w = init_weights(len(fc))
        for _ in range(20):
            w = gradient_step(w, X, y, 0.4)
        roc = roc_curve(w, tX, tY)
        if roc["auc"] < 0.55:
            raise AssertionError(f"AUC {roc['auc']:.3f} < 0.55")
        return f"AUC = {roc['auc']:.3f}"

    tests = [
        ("db_connect",          "Supabase connection",           "Infrastructure", test_db_connect),
        ("db_write",            "Supabase write (audit log)",     "Infrastructure", test_db_write),
        ("rls_isolation",       "RLS row isolation",              "Security",       test_rls),
        ("aes_roundtrip",       "AES-256-GCM round-trip",         "Cryptography",   test_aes),
        ("aes_wrong_key",       "Wrong-key rejection",            "Cryptography",   test_wrong_key),
        ("model_passphrase",    "Per-user model passphrase",      "Cryptography",   test_passphrase),
        ("gradient_step",       "Gradient step loss reduction",   "ML Core",        test_gradient),
        ("central_convergence", "Central training convergence",   "ML Core",        test_central),
        ("fedavg_convergence",  "FedAvg convergence (3 clients)", "ML Core",        test_fedavg),
        ("confusion_matrix",    "Confusion matrix correctness",   "Metrics",        test_cm),
        ("roc_auc",             "ROC-AUC on balanced data",       "Metrics",        test_auc),
    ]

    results = [_run(*t) for t in tests]
    passed  = sum(1 for r in results if r["status"] == "pass")

    return json_response({
        "results":  results,
        "passed":   passed,
        "failed":   len(results) - passed,
        "total":    len(results),
        "all_pass": passed == len(results),
    })
