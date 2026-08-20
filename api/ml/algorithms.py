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
from ml.logistic import (
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
    weights = init_weights(len(X[0]))
    history = []
    for r in range(1, rounds + 1):
        weights = gradient_step(weights, X, y, lr)
        loss = cross_entropy_loss(weights, val_X, val_y)
        acc  = accuracy(weights, val_X, val_y)
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
    global_w = init_weights(len(clients[0]["X"][0]))
    history = []
    for r in range(1, rounds + 1):
        updated, counts = [], []
        for c in clients:
            local = clone_weights(global_w)
            for _ in range(local_epochs):
                local = gradient_step(local, c["X"], c["y"], lr)
            updated.append(local)
            counts.append(len(c["X"]))
        global_w = average_weights(updated, counts)
        loss = cross_entropy_loss(global_w, val_X, val_y)
        acc  = accuracy(global_w, val_X, val_y)
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
    global_w = init_weights(len(clients[0]["X"][0]))
    history = []
    for r in range(1, rounds + 1):
        updated, counts = [], []
        for c in clients:
            local = clone_weights(global_w)
            for _ in range(local_epochs):
                prox_grad = [mu * (local["w"][j] - global_w["w"][j]) for j in range(len(local["w"]))]
                local = gradient_step(local, c["X"], c["y"], lr, extra_grad=prox_grad)
            updated.append(local)
            counts.append(len(c["X"]))
        global_w = average_weights(updated, counts)
        loss = cross_entropy_loss(global_w, val_X, val_y)
        acc  = accuracy(global_w, val_X, val_y)
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
    n_f = len(clients[0]["X"][0])
    global_w = init_weights(n_f)
    c_global  = [0.0] * n_f
    c_clients = [[0.0] * n_f for _ in clients]
    history = []

    for r in range(1, rounds + 1):
        updated, counts, delta_c = [], [], []
        for i, c in enumerate(clients):
            local = clone_weights(global_w)
            c_local = c_clients[i]
            for _ in range(local_epochs):
                correction = [c_global[j] - c_local[j] for j in range(n_f)]
                neg_corr   = [-v for v in correction]
                local = gradient_step(local, c["X"], c["y"], lr, extra_grad=neg_corr)
            steps = local_epochs
            new_c_local = [
                c_local[j] - c_global[j] + (global_w["w"][j] - local["w"][j]) / (steps * lr)
                for j in range(n_f)
            ]
            delta_c.append([new_c_local[j] - c_local[j] for j in range(n_f)])
            c_clients[i] = new_c_local
            updated.append(local)
            counts.append(len(c["X"]))

        global_w = average_weights(updated, counts)
        n_clients = len(clients)
        c_global = [c_global[j] + sum(dc[j] for dc in delta_c) / n_clients for j in range(n_f)]

        loss = cross_entropy_loss(global_w, val_X, val_y)
        acc  = accuracy(global_w, val_X, val_y)
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
    n_f = len(X[0])
    weights = init_weights(n_f)
    n = len(X)
    history = []
    privacy_log = []

    for r in range(1, rounds + 1):
        grad_sum = [0.0] * n_f
        b_sum = 0.0

        for xi, yi in zip(X, y):
            err = predict_proba(weights, xi) - yi
            g = [err * xi[j] for j in range(n_f)]
            norm = _l2_norm(g) or 1e-9
            clip = min(1.0, clip_norm / norm)
            for j in range(n_f):
                grad_sum[j] += g[j] * clip
            b_sum += err * min(1.0, clip_norm / (abs(err) or 1e-9))

        noise_std = noise_multiplier * clip_norm
        new_w = [
            weights["w"][j] - lr * ((grad_sum[j] + _gaussian_noise() * noise_std) / n)
            for j in range(n_f)
        ]
        weights = {"w": new_w, "b": weights["b"] - lr * (b_sum / n)}

        loss = cross_entropy_loss(weights, val_X, val_y)
        acc  = accuracy(weights, val_X, val_y)

        # Approximate Gaussian-mechanism composition bound
        eps_round = math.sqrt(2 * math.log(1.25 / delta)) / noise_multiplier
        eps_cumul = math.sqrt(2 * r * math.log(1 / delta)) / noise_multiplier

        entry = {
            "round": r, "loss": round(loss, 6), "accuracy": round(acc, 6),
            "epsilon": round(eps_cumul, 6), "delta": delta,
        }
        history.append(entry)
        privacy_log.append({"round": r, "epsilon": round(eps_cumul, 6), "delta": delta})
        if on_round:
            on_round(entry)

    return {"weights": weights, "history": history, "privacy": privacy_log}


ALGORITHMS = {
    "central": {"label": "Central Training",  "color": "#7C879A", "needs_clients": False},
    "fedavg":  {"label": "FedAvg",            "color": "#6C7CFF", "needs_clients": True},
    "fedprox": {"label": "FedProx",           "color": "#4FE3C1", "needs_clients": True},
    "scaffold":{"label": "SCAFFOLD",          "color": "#F2A94E", "needs_clients": True},
    "dpsgd":   {"label": "FL + DP-SGD",       "color": "#F0618C", "needs_clients": False},
}
