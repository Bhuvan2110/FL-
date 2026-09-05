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

def _is_missing(val) -> bool:
    if val is None:
        return True
    s = str(val).strip().lower()
    return s in ("", "?", "na", "nan", "null", "none")


def _try_parse_float(val) -> float | None:
    if _is_missing(val):
        return None
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, bool):
        return 1.0 if val else 0.0
    s = str(val).strip()
    if s.lower() == "true":
        return 1.0
    if s.lower() == "false":
        return 0.0
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def _encode_label_val(val, binary_map=None) -> int:
    if val is None:
        return 0
    if isinstance(val, bool):
        return 1 if val else 0
    if isinstance(val, (int, float)):
        return 1 if float(val) > 0 else 0
    s = str(val).strip()
    if s.lower() in ("true", "1", "yes", "positive", "t", "y"):
        return 1
    if s.lower() in ("false", "0", "no", "negative", "f", "n"):
        return 0
    try:
        f = float(s)
        return 1 if f > 0 else 0
    except ValueError:
        if binary_map and s in binary_map:
            return binary_map[s]
        return 0


def to_xy(rows: List[Dict], feature_cols: List[str], label_col: str) -> Tuple:
    label_vals = [r.get(label_col) for r in rows]
    unique_labels = list(set(str(v).strip() for v in label_vals if not _is_missing(v)))

    binary_map = None
    if len(unique_labels) == 2 and not all(_try_parse_float(l) is not None for l in unique_labels):
        binary_map = {unique_labels[0]: 0, unique_labels[1]: 1}

    X = [[float(r[c]) for c in feature_cols] for r in rows]
    y = [_encode_label_val(r.get(label_col), binary_map) for r in rows]
    return X, y


def min_max_normalize(rows: List[Dict], feature_cols: List[str]):
    stats = {}
    for c in feature_cols:
        col_vals = [r.get(c) for r in rows]
        parsed_floats = [_try_parse_float(v) for v in col_vals]
        non_null_floats = [v for v in parsed_floats if v is not None]

        # If >= 40% of non-empty values are valid numbers, treat as numeric
        is_numeric = len(non_null_floats) >= (len(col_vals) * 0.4) and len(non_null_floats) > 0

        if is_numeric:
            mn = min(non_null_floats) if non_null_floats else 0.0
            mx = max(non_null_floats) if non_null_floats else 1.0
            avg = sum(non_null_floats) / len(non_null_floats) if non_null_floats else 0.0
            stats[c] = {
                "type": "numeric",
                "min": mn,
                "max": mx,
                "default": avg,
            }
        else:
            unique_cats = []
            for v in col_vals:
                if not _is_missing(v):
                    s = str(v).strip()
                    if s not in unique_cats:
                        unique_cats.append(s)
            cat_map = {cat: float(idx) for idx, cat in enumerate(unique_cats)}
            stats[c] = {
                "type": "categorical",
                "categories": cat_map,
                "min": 0.0,
                "max": float(len(unique_cats) - 1) if unique_cats else 1.0,
                "default": 0.0,
            }

    normed = []
    for r in rows:
        nr = dict(r)
        for c in feature_cols:
            col_stat = stats[c]
            val = r.get(c)
            if col_stat["type"] == "numeric":
                parsed = _try_parse_float(val)
                num_val = parsed if parsed is not None else col_stat["default"]
            else:
                s = str(val).strip() if not _is_missing(val) else ""
                num_val = col_stat["categories"].get(s, col_stat["default"])

            rng = col_stat["max"] - col_stat["min"]
            rng = rng if rng != 0.0 else 1.0
            nr[c] = (num_val - col_stat["min"]) / rng
        normed.append(nr)
    return normed, stats


def apply_min_max(row: Dict, feature_cols: List[str], stats: Dict) -> List[float]:
    result = []
    for c in feature_cols:
        col_stat = stats.get(c, {"type": "numeric", "min": 0.0, "max": 1.0, "default": 0.0})
        val = row.get(c)
        if col_stat.get("type") == "categorical" and "categories" in col_stat:
            s = str(val).strip() if not _is_missing(val) else ""
            num_val = col_stat["categories"].get(s, col_stat.get("default", 0.0))
        else:
            parsed = _try_parse_float(val)
            num_val = parsed if parsed is not None else col_stat.get("default", 0.0)

        mn = col_stat.get("min", 0.0)
        mx = col_stat.get("max", 1.0)
        rng = mx - mn if (mx - mn) != 0.0 else 1.0
        result.append((num_val - mn) / rng)
    return result


def stratified_split(rows: List[Dict], label_col: str, seed: int = 7):
    rng = random.Random(seed)
    by_class: Dict[str, List] = {}
    for r in rows:
        k = str(_encode_label_val(r.get(label_col)))
        by_class.setdefault(k, []).append(r)
    train, val, test = [], [], []
    for group in by_class.values():
        shuffled = list(group)
        rng.shuffle(shuffled)
        n = len(shuffled)
        n_train = max(int(n * 0.6), 1) if n >= 3 else n
        n_val   = max(int(n * 0.2), 1) if n >= 3 else 0
        train += shuffled[:n_train]
        val   += shuffled[n_train:n_train + n_val]
        test  += shuffled[n_train + n_val:]
    if not train:
        train = list(rows)
    if not val:
        val = list(train)
    if not test:
        test = list(train)
    return train, val, test


def _gamma_sample(shape: float, rng: random.Random) -> float:
    if shape < 1.0:
        return _gamma_sample(1.0 + shape, rng) * (rng.random() ** (1.0 / shape))
    d = shape - 1.0 / 3.0
    c = 1.0 / math.sqrt(9.0 * d)
    while True:
        z = rng.gauss(0, 1)
        v = 1.0 + c * z
        if v <= 0:
            continue
        v = v * v * v
        u = rng.random()
        if u < 1.0 - 0.0331 * z * z * z * z:
            return d * v
        if math.log(u) < 0.5 * z * z + d * (1.0 - v + math.log(v)):
            return d * v


def dirichlet_partition(rows: List[Dict], label_col: str, n_clients: int, alpha: float = 0.5, seed: int = 42) -> List[List[Dict]]:
    rng = random.Random(seed)
    by_class: Dict[str, List[Dict]] = {}
    for r in rows:
        k = str(_encode_label_val(r.get(label_col)))
        by_class.setdefault(k, []).append(r)

    clients: List[List[Dict]] = [[] for _ in range(n_clients)]
    for c_label, group in by_class.items():
        shuffled = list(group)
        rng.shuffle(shuffled)
        gammas = [_gamma_sample(max(alpha, 0.01), rng) for _ in range(n_clients)]
        total = sum(gammas) or 1.0
        props = [g / total for g in gammas]

        counts = [int(p * len(shuffled)) for p in props]
        remainder = len(shuffled) - sum(counts)
        for i in range(remainder):
            counts[i % n_clients] += 1

        start = 0
        for cli_idx, cnt in enumerate(counts):
            clients[cli_idx].extend(shuffled[start:start + cnt])
            start += cnt

    for c in clients:
        rng.shuffle(c)
    return clients


def partition_clients(rows: List[Dict], label_col: str, n_clients: int, iid: bool = True, seed: int = 3, alpha: float | None = None):
    if not iid and alpha is not None and alpha > 0:
        return dirichlet_partition(rows, label_col, n_clients, alpha=alpha, seed=seed)

    rng = random.Random(seed)
    if iid:
        data = list(rows)
        rng.shuffle(data)
    else:
        data = sorted(rows, key=lambda r: _encode_label_val(r.get(label_col)))
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
