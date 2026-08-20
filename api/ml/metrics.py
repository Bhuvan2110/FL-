"""
Evaluation metrics implemented from scratch — no sklearn.
"""
import math
from typing import List, Dict, Tuple
from ml.logistic import predict_proba, predict


def confusion_matrix(weights: Dict, X: List[List[float]], y: List[int], threshold: float = 0.5):
    tp = tn = fp = fn = 0
    for xi, yi in zip(X, y):
        pred = 1 if predict_proba(weights, xi) >= threshold else 0
        if pred == 1 and yi == 1: tp += 1
        elif pred == 0 and yi == 0: tn += 1
        elif pred == 1 and yi == 0: fp += 1
        else: fn += 1
    return {"tp": tp, "tn": tn, "fp": fp, "fn": fn}


def classification_report(weights: Dict, X: List[List[float]], y: List[int], threshold: float = 0.5) -> Dict:
    cm = confusion_matrix(weights, X, y, threshold)
    tp, tn, fp, fn = cm["tp"], cm["tn"], cm["fp"], cm["fn"]
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall    = tp / (tp + fn) if tp + fn else 0.0
    f1        = (2 * precision * recall) / (precision + recall) if precision + recall else 0.0
    acc       = (tp + tn) / len(X) if X else 0.0
    return {
        **cm,
        "precision": round(precision, 6),
        "recall":    round(recall, 6),
        "f1":        round(f1, 6),
        "accuracy":  round(acc, 6),
    }


def roc_curve(weights: Dict, X: List[List[float]], y: List[int], steps: int = 50) -> Dict:
    """ROC curve via threshold sweep + AUC via trapezoidal rule."""
    points = []
    for i in range(steps + 1):
        t = i / steps
        cm = confusion_matrix(weights, X, y, t)
        tpr = cm["tp"] / (cm["tp"] + cm["fn"]) if cm["tp"] + cm["fn"] else 0.0
        fpr = cm["fp"] / (cm["fp"] + cm["tn"]) if cm["fp"] + cm["tn"] else 0.0
        points.append({"threshold": round(t, 3), "tpr": round(tpr, 4), "fpr": round(fpr, 4)})

    pts_sorted = sorted(points, key=lambda p: p["fpr"])
    auc = 0.0
    for i in range(1, len(pts_sorted)):
        dx  = pts_sorted[i]["fpr"]  - pts_sorted[i-1]["fpr"]
        avg = (pts_sorted[i]["tpr"] + pts_sorted[i-1]["tpr"]) / 2
        auc += dx * avg

    return {"points": pts_sorted, "auc": round(auc, 6)}


def feature_importance(weights: Dict, feature_names: List[str]) -> List[Dict]:
    """Ranks features by |weight| magnitude (on normalised features = comparable scale)."""
    abs_w = [abs(w) for w in weights["w"]]
    total = sum(abs_w) or 1.0
    ranked = [
        {"name": n, "importance": round(a / total, 6), "weight": round(weights["w"][i], 6)}
        for i, (n, a) in enumerate(zip(feature_names, abs_w))
    ]
    return sorted(ranked, key=lambda x: -x["importance"])


def platt_scale(raw_scores: List[float], labels: List[int], iters: int = 300, lr: float = 0.1) -> Dict:
    """
    Calibrates model confidence via Platt scaling (1D logistic fit on raw scores).
    Returns {A, B} so calibrated_prob = sigmoid(A * score + B).
    """
    A, B = 0.0, 0.0
    n = len(raw_scores)
    for _ in range(iters):
        gA = gB = 0.0
        for s, label in zip(raw_scores, labels):
            p = 1 / (1 + math.exp(A * s + B))
            err = p - label
            gA += err * s
            gB += err
        A -= lr * (gA / n)
        B -= lr * (gB / n)
    return {"A": round(A, 6), "B": round(B, 6)}


def calibrate_proba(score: float, platt: Dict) -> float:
    return 1 / (1 + math.exp(platt["A"] * score + platt["B"]))
