"""
Logistic regression implemented from mathematical first principles in Python.
No scikit-learn, no PyTorch — pure Python + optional NumPy for speed.
"""
import math
import random
from typing import List, Tuple, Dict


# ── Core math ──────────────────────────────────────────────────────────────

def sigmoid(z: float) -> float:
    if z >= 0:
        return 1.0 / (1.0 + math.exp(-z))
    e = math.exp(z)
    return e / (1.0 + e)


def dot(w: List[float], x: List[float]) -> float:
    return sum(wi * xi for wi, xi in zip(w, x))


def predict_proba(weights: Dict, x: List[float]) -> float:
    return sigmoid(dot(weights["w"], x) + weights["b"])


def predict(weights: Dict, x: List[float], threshold: float = 0.5) -> int:
    return 1 if predict_proba(weights, x) >= threshold else 0


# ── Loss & accuracy ────────────────────────────────────────────────────────

def cross_entropy_loss(weights: Dict, X: List[List[float]], y: List[int]) -> float:
    n = len(X)
    loss = 0.0
    for xi, yi in zip(X, y):
        p = max(min(predict_proba(weights, xi), 1 - 1e-9), 1e-9)
        loss += -(yi * math.log(p) + (1 - yi) * math.log(1 - p))
    return loss / n


def accuracy(weights: Dict, X: List[List[float]], y: List[int]) -> float:
    if not X:
        return 0.0
    return sum(predict(weights, xi) == yi for xi, yi in zip(X, y)) / len(X)


# ── Initialisation ─────────────────────────────────────────────────────────

def init_weights(n_features: int) -> Dict:
    return {"w": [0.0] * n_features, "b": 0.0}


def clone_weights(w: Dict) -> Dict:
    return {"w": list(w["w"]), "b": w["b"]}


# ── Gradient step ──────────────────────────────────────────────────────────

def gradient_step(
    weights: Dict,
    X: List[List[float]],
    y: List[int],
    lr: float,
    l2: float = 0.0,
    extra_grad: List[float] | None = None,
) -> Dict:
    n = len(X)
    n_f = len(weights["w"])
    grad_w = [0.0] * n_f
    grad_b = 0.0

    for xi, yi in zip(X, y):
        err = predict_proba(weights, xi) - yi
        for j in range(n_f):
            grad_w[j] += err * xi[j]
        grad_b += err

    new_w = [
        weights["w"][j] - lr * (grad_w[j] / n + l2 * weights["w"][j] + (extra_grad[j] if extra_grad else 0.0))
        for j in range(n_f)
    ]
    return {"w": new_w, "b": weights["b"] - lr * (grad_b / n)}


# ── Weighted average (FedAvg aggregation) ─────────────────────────────────

def average_weights(weight_list: List[Dict], sample_counts: List[int]) -> Dict:
    total = sum(sample_counts)
    n_f = len(weight_list[0]["w"])
    w = [0.0] * n_f
    b = 0.0
    for wt, cnt in zip(weight_list, sample_counts):
        frac = cnt / total
        for j in range(n_f):
            w[j] += wt["w"][j] * frac
        b += wt["b"] * frac
    return {"w": w, "b": b}


# ── Data helpers ───────────────────────────────────────────────────────────

def to_xy(rows: List[Dict], feature_cols: List[str], label_col: str) -> Tuple:
    X = [[float(r[c]) for c in feature_cols] for r in rows]
    y = [int(r[label_col]) for r in rows]
    return X, y


def min_max_normalize(rows: List[Dict], feature_cols: List[str]):
    stats = {}
    for c in feature_cols:
        vals = [float(r[c]) for r in rows]
        mn, mx = min(vals), max(vals)
        stats[c] = {"min": mn, "max": mx}
    normed = []
    for r in rows:
        nr = dict(r)
        for c in feature_cols:
            rng = stats[c]["max"] - stats[c]["min"] or 1.0
            nr[c] = (float(r[c]) - stats[c]["min"]) / rng
        normed.append(nr)
    return normed, stats


def apply_min_max(row: Dict, feature_cols: List[str], stats: Dict) -> List[float]:
    result = []
    for c in feature_cols:
        rng = stats[c]["max"] - stats[c]["min"] or 1.0
        result.append((float(row[c]) - stats[c]["min"]) / rng)
    return result


def stratified_split(rows: List[Dict], label_col: str, seed: int = 7):
    rng = random.Random(seed)
    by_class: Dict[str, List] = {}
    for r in rows:
        k = str(r[label_col])
        by_class.setdefault(k, []).append(r)
    train, val, test = [], [], []
    for group in by_class.values():
        shuffled = list(group)
        rng.shuffle(shuffled)
        n = len(shuffled)
        n_train = int(n * 0.6)
        n_val   = int(n * 0.2)
        train += shuffled[:n_train]
        val   += shuffled[n_train:n_train + n_val]
        test  += shuffled[n_train + n_val:]
    return train, val, test


def partition_clients(rows: List[Dict], label_col: str, n_clients: int, iid: bool = True, seed: int = 3):
    rng = random.Random(seed)
    if iid:
        data = list(rows)
        rng.shuffle(data)
    else:
        data = sorted(rows, key=lambda r: r[label_col])
    clients = [[] for _ in range(n_clients)]
    for i, r in enumerate(data):
        clients[i % n_clients].append(r)
    return clients


def generate_synthetic_dataset(n_rows: int = 600, n_features: int = 5, seed: int = 42):
    rng = random.Random(seed)

    def gauss():
        u1 = max(rng.random(), 1e-9)
        u2 = rng.random()
        return math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)

    cols = [f"feature_{i+1}" for i in range(n_features)]
    rows = []
    for i in range(n_rows):
        label = i % 2
        row = {}
        for j, c in enumerate(cols):
            mean = (1.8 + j * 0.2) if label == 1 else (-1.8 - j * 0.15)
            row[c] = round(mean + gauss() * 0.7, 4)
        row["label"] = label
        rows.append(row)
    return {"cols": [*cols, "label"], "rows": rows, "label_col": "label"}
