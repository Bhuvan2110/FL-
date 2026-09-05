"""
Federated Learning algorithms implemented from mathematical first principles.
No ML libraries (scikit-learn, PyTorch, TensorFlow) — pure Python math.

Algorithms:
  - Central Training   (baseline)
  - FedAvg             (McMahan et al. 2017)
  - FedProx            (Li et al. 2018)
  - SCAFFOLD           (Karimireddy et al. 2020)
  - DP-SGD             (Abadi et al. 2016) + Gaussian-mechanism privacy accountant
"""
import math
import random
from typing import List, Dict, Callable, Optional, Tuple
try:
    from ml.logistic import (
        init_weights, clone_weights, gradient_step, average_weights,
        cross_entropy_loss, accuracy, predict_proba,
    )
except ImportError:
    from api.ml.logistic import (
        init_weights, clone_weights, gradient_step, average_weights,
        cross_entropy_loss, accuracy, predict_proba,
    )


# ── Central Training ────────────────────────────────────────────────────────

def train_central(
    X: List[List[float]],
    y: List[int],
    val_X: List[List[float]],
    val_y: List[int],
    rounds: int = 30,
    lr: float = 0.4,
    on_round: Optional[Callable] = None,
) -> Dict:
    if not X or not X[0]:
        return {"weights": init_weights(0), "history": []}

    n_f = len(X[0])
    weights = init_weights(n_f)
    history = []

    eval_X = val_X if (val_X and val_X[0]) else X
    eval_y = val_y if (val_y and len(val_y) == len(eval_X)) else y

    for r in range(1, rounds + 1):
        weights = gradient_step(weights, X, y, lr)
        loss = cross_entropy_loss(weights, eval_X, eval_y)
        acc  = accuracy(weights, eval_X, eval_y)
        entry = {"round": r, "loss": round(loss, 6), "accuracy": round(acc, 6)}
        history.append(entry)
        if on_round:
            on_round(entry)
    return {"weights": weights, "history": history}


# ── FedAvg ──────────────────────────────────────────────────────────────────

def train_fedavg(
    clients: List[Dict],           # each: {"X": [...], "y": [...]}
    val_X: List[List[float]],
    val_y: List[int],
    rounds: int = 30,
    local_epochs: int = 3,
    lr: float = 0.4,
    on_round: Optional[Callable] = None,
) -> Dict:
    valid_clients = [c for c in clients if c.get("X") and c["X"][0] and len(c.get("y", [])) == len(c["X"])]
    if not valid_clients:
        return {"weights": init_weights(0), "history": []}

    n_f = len(valid_clients[0]["X"][0])
    global_w = init_weights(n_f)
    history = []

    eval_X = val_X if (val_X and val_X[0]) else valid_clients[0]["X"]
    eval_y = val_y if (val_y and len(val_y) == len(eval_X)) else valid_clients[0]["y"]

    for r in range(1, rounds + 1):
        updated, counts = [], []
        for c in valid_clients:
            local = clone_weights(global_w)
            for _ in range(local_epochs):
                local = gradient_step(local, c["X"], c["y"], lr)
            updated.append(local)
            counts.append(len(c["X"]))

        if sum(counts) > 0:
            global_w = average_weights(updated, counts)

        loss = cross_entropy_loss(global_w, eval_X, eval_y)
        acc  = accuracy(global_w, eval_X, eval_y)
        entry = {"round": r, "loss": round(loss, 6), "accuracy": round(acc, 6)}
        history.append(entry)
        if on_round:
            on_round(entry)
    return {"weights": global_w, "history": history}


# ── FedProx ─────────────────────────────────────────────────────────────────

def train_fedprox(
    clients: List[Dict],
    val_X: List[List[float]],
    val_y: List[int],
    rounds: int = 30,
    local_epochs: int = 3,
    lr: float = 0.4,
    mu: float = 0.01,
    on_round: Optional[Callable] = None,
) -> Dict:
    valid_clients = [c for c in clients if c.get("X") and c["X"][0] and len(c.get("y", [])) == len(c["X"])]
    if not valid_clients:
        return {"weights": init_weights(0), "history": []}

    n_f = len(valid_clients[0]["X"][0])
    global_w = init_weights(n_f)
    history = []

    eval_X = val_X if (val_X and val_X[0]) else valid_clients[0]["X"]
    eval_y = val_y if (val_y and len(val_y) == len(eval_X)) else valid_clients[0]["y"]

    for r in range(1, rounds + 1):
        updated, counts = [], []
        for c in valid_clients:
            local = clone_weights(global_w)
            for _ in range(local_epochs):
                prox_grad = [mu * (local["w"][j] - global_w["w"][j]) for j in range(n_f)]
                local = gradient_step(local, c["X"], c["y"], lr, extra_grad=prox_grad)
            updated.append(local)
            counts.append(len(c["X"]))

        if sum(counts) > 0:
            global_w = average_weights(updated, counts)

        loss = cross_entropy_loss(global_w, eval_X, eval_y)
        acc  = accuracy(global_w, eval_X, eval_y)
        entry = {"round": r, "loss": round(loss, 6), "accuracy": round(acc, 6)}
        history.append(entry)
        if on_round:
            on_round(entry)
    return {"weights": global_w, "history": history}


# ── SCAFFOLD ─────────────────────────────────────────────────────────────────

def train_scaffold(
    clients: List[Dict],
    val_X: List[List[float]],
    val_y: List[int],
    rounds: int = 30,
    local_epochs: int = 3,
    lr: float = 0.4,
    on_round: Optional[Callable] = None,
) -> Dict:
    valid_clients = [c for c in clients if c.get("X") and c["X"][0] and len(c.get("y", [])) == len(c["X"])]
    if not valid_clients:
        return {"weights": init_weights(0), "history": []}

    n_f = len(valid_clients[0]["X"][0])
    global_w = init_weights(n_f)
    c_global  = [0.0] * n_f
    c_clients = [[0.0] * n_f for _ in valid_clients]
    history = []

    eval_X = val_X if (val_X and val_X[0]) else valid_clients[0]["X"]
    eval_y = val_y if (val_y and len(val_y) == len(eval_X)) else valid_clients[0]["y"]

    for r in range(1, rounds + 1):
        updated, counts, delta_c = [], [], []
        for i, c in enumerate(valid_clients):
            local = clone_weights(global_w)
            c_local = c_clients[i]
            for _ in range(local_epochs):
                correction = [c_global[j] - c_local[j] for j in range(n_f)]
                neg_corr   = [-v for v in correction]
                local = gradient_step(local, c["X"], c["y"], lr, extra_grad=neg_corr)

            steps = local_epochs
            step_factor = (steps * lr) if (steps * lr) != 0 else 1.0
            new_c_local = [
                c_local[j] - c_global[j] + (global_w["w"][j] - local["w"][j]) / step_factor
                for j in range(n_f)
            ]
            delta_c.append([new_c_local[j] - c_local[j] for j in range(n_f)])
            c_clients[i] = new_c_local
            updated.append(local)
            counts.append(len(c["X"]))

        if sum(counts) > 0:
            global_w = average_weights(updated, counts)

        n_clients = len(valid_clients)
        if n_clients > 0:
            c_global = [c_global[j] + sum(dc[j] for dc in delta_c) / n_clients for j in range(n_f)]

        loss = cross_entropy_loss(global_w, eval_X, eval_y)
        acc  = accuracy(global_w, eval_X, eval_y)
        entry = {"round": r, "loss": round(loss, 6), "accuracy": round(acc, 6)}
        history.append(entry)
        if on_round:
            on_round(entry)
    return {"weights": global_w, "history": history}


# ── DP-SGD ───────────────────────────────────────────────────────────────────

def _l2_norm(vec: List[float]) -> float:
    return math.sqrt(sum(v * v for v in vec))


def _gaussian_noise() -> float:
    import os
    # Box-Muller using os.urandom for cryptographic quality
    u1 = int.from_bytes(os.urandom(4), "big") / 2**32
    u2 = int.from_bytes(os.urandom(4), "big") / 2**32
    u1 = max(u1, 1e-9)
    return math.sqrt(-2 * math.log(u1)) * math.cos(2 * math.pi * u2)


def train_dpsgd(
    X: List[List[float]],
    y: List[int],
    val_X: List[List[float]],
    val_y: List[int],
    rounds: int = 30,
    lr: float = 0.4,
    clip_norm: float = 1.0,
    noise_multiplier: float = 1.1,
    delta: float = 1e-5,
    on_round: Optional[Callable] = None,
) -> Dict:
    if not X or not X[0]:
        return {"weights": init_weights(0), "history": [], "privacy": []}

    n_f = len(X[0])
    weights = init_weights(n_f)
    n = len(X)
    history = []
    privacy_log = []

    eval_X = val_X if (val_X and val_X[0]) else X
    eval_y = val_y if (val_y and len(val_y) == len(eval_X)) else y

    safe_delta = max(min(delta, 0.999), 1e-15)
    noise_mult = max(noise_multiplier, 1e-6)

    for r in range(1, rounds + 1):
        grad_sum = [0.0] * n_f
        b_sum = 0.0

        for xi, yi in zip(X, y):
            err = predict_proba(weights, xi) - yi
            g_w = [err * xi[j] for j in range(n_f)]
            g_b = err
            full_norm = math.sqrt(sum(v * v for v in g_w) + g_b * g_b) or 1e-9
            clip = min(1.0, clip_norm / full_norm)

            for j in range(n_f):
                grad_sum[j] += g_w[j] * clip
            b_sum += g_b * clip

        noise_std = noise_mult * clip_norm
        new_w = [
            weights["w"][j] - lr * ((grad_sum[j] + _gaussian_noise() * noise_std) / n)
            for j in range(n_f)
        ]
        new_b = weights["b"] - lr * ((b_sum + _gaussian_noise() * noise_std) / n)
        weights = {"w": new_w, "b": new_b}

        loss = cross_entropy_loss(weights, eval_X, eval_y)
        acc  = accuracy(weights, eval_X, eval_y)

        # Approximate Gaussian-mechanism composition bound
        eps_cumul = math.sqrt(2 * r * math.log(1.25 / safe_delta)) / noise_mult

        entry = {
            "round": r, "loss": round(loss, 6), "accuracy": round(acc, 6),
            "epsilon": round(eps_cumul, 6), "delta": safe_delta,
        }
        history.append(entry)
        privacy_log.append({"round": r, "epsilon": round(eps_cumul, 6), "delta": safe_delta})
        if on_round:
            on_round(entry)

    return {"weights": weights, "history": history, "privacy": privacy_log}


# ── Byzantine-Robust Krum ───────────────────────────────────────────────────

def train_krum(
    clients: List[Dict],
    val_X: List[List[float]],
    val_y: List[int],
    rounds: int = 30,
    local_epochs: int = 3,
    lr: float = 0.4,
    byzantine_count: int = 1,
    on_round: Optional[Callable] = None,
) -> Dict:
    valid_clients = [c for c in clients if c.get("X") and c["X"][0] and len(c.get("y", [])) == len(c["X"])]
    if not valid_clients:
        return {"weights": init_weights(0), "history": []}

    n_f = len(valid_clients[0]["X"][0])
    global_w = init_weights(n_f)
    history = []

    eval_X = val_X if (val_X and val_X[0]) else valid_clients[0]["X"]
    eval_y = val_y if (val_y and len(val_y) == len(eval_X)) else valid_clients[0]["y"]

    for r in range(1, rounds + 1):
        updated = []
        for c in valid_clients:
            local = clone_weights(global_w)
            for _ in range(local_epochs):
                local = gradient_step(local, c["X"], c["y"], lr)
            updated.append(local)

        m = len(updated)
        f = min(byzantine_count, max(0, (m - 3) // 2))
        k = max(1, m - f - 2)

        scores = []
        for i in range(m):
            dists = []
            for j in range(m):
                if i == j: continue
                w_dist_sq = sum((updated[i]["w"][idx] - updated[j]["w"][idx]) ** 2 for idx in range(n_f))
                b_dist_sq = (updated[i]["b"] - updated[j]["b"]) ** 2
                dists.append(w_dist_sq + b_dist_sq)
            dists.sort()
            scores.append(sum(dists[:k]))

        best_idx = scores.index(min(scores)) if scores else 0
        global_w = clone_weights(updated[best_idx])

        loss = cross_entropy_loss(global_w, eval_X, eval_y)
        acc  = accuracy(global_w, eval_X, eval_y)
        entry = {"round": r, "loss": round(loss, 6), "accuracy": round(acc, 6)}
        history.append(entry)
        if on_round:
            on_round(entry)
    return {"weights": global_w, "history": history}


ALGORITHMS = {
    "central": {"label": "Central Training",  "color": "#7C879A", "needs_clients": False},
    "fedavg":  {"label": "FedAvg",            "color": "#6C7CFF", "needs_clients": True},
    "fedprox": {"label": "FedProx",           "color": "#4FE3C1", "needs_clients": True},
    "scaffold":{"label": "SCAFFOLD",          "color": "#F2A94E", "needs_clients": True},
    "krum":    {"label": "FedAvg + Krum",     "color": "#A78BFA", "needs_clients": True},
    "dpsgd":   {"label": "FL + DP-SGD",       "color": "#F0618C", "needs_clients": False},
}
