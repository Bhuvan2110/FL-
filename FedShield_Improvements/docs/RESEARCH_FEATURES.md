# FedShield — Research Features

> Ideas to make FedShield a genuine federated learning research platform,
> not just a demo. All algorithms remain implemented from mathematical
> first principles — no external ML libraries.

---

## 1. Privacy-Utility Trade-off Visualisation

**Problem:** Researchers cannot easily see how increasing privacy (higher noise)
hurts model accuracy.

**Solution:** An interactive chart on the DP-SGD config panel:
- X-axis: noise_multiplier (0.5 → 3.0)
- Y-axis: estimated accuracy loss
- Overlay: corresponding ε value at each noise level
- Live-updating as the user drags the slider

**Mathematical basis:**
```
ε ≈ √(2T·ln(1/δ)) / σ
accuracy_drop ≈ f(σ, clip_norm, n_samples)
```

**Impact:** ⭐⭐⭐⭐⭐ — Core research value, unique differentiator.

---

## 2. Non-IID Data Simulator (Dirichlet Partition)

**Problem:** Current IID/Non-IID toggle is binary and unrealistic.

**Solution:** Dirichlet distribution partitioning with configurable α:
- α = 100  → near-IID (uniform)
- α = 1.0  → moderate heterogeneity
- α = 0.1  → extreme non-IID (each client sees 1-2 classes)

**Implementation (Python from scratch):**
```python
def dirichlet_partition(rows, label_col, n_clients, alpha, seed):
    classes = list(set(r[label_col] for r in rows))
    proportions = np.random.dirichlet([alpha] * n_clients, len(classes))
    # assign rows to clients based on proportions
    ...
```

**UI:** A slider for α with a live class-distribution bar chart per client.

**Impact:** ⭐⭐⭐⭐⭐ — Makes it a real FL research tool.

---

## 3. Client Drop-out Simulation

**Problem:** Real federated learning has unreliable clients — devices go offline
mid-round. Current implementation assumes all clients always participate.

**Solution:** Configurable drop-out rate per round:
- `dropout_rate = 0.2` → 20% of clients randomly skip each round
- Show which clients participated vs dropped in the round log
- Compare convergence with vs without drop-out

**Mathematical effect:**
```
effective_clients_per_round = num_clients × (1 - dropout_rate)
aggregation_weight adjusted for actual participants only
```

**Impact:** ⭐⭐⭐⭐ — Simulates real-world FL conditions.

---

## 4. Byzantine-Robust Aggregation (Model Poisoning Detection)

**Problem:** A malicious client can send poisoned gradients to corrupt the global model.

**Solution:** Implement Krum or median-based aggregation as an alternative to FedAvg:
- **Krum:** Select the client update with minimum sum of distances to its k nearest neighbours
- **Coordinate-wise median:** Replace weighted average with per-coordinate median
- Flag clients whose updates deviate more than 2σ from the mean

**New algorithm option:** `FedAvg + Krum` in the algorithm selector.

**Impact:** ⭐⭐⭐⭐ — Critical for security-focused research.

---

## 5. Gradient Norm Monitoring

**Problem:** Users cannot see how DP-SGD clipping affects training.

**Solution:** Per-round gradient norm plot alongside loss/accuracy:
- Pre-clip L2 norm (shows natural gradient magnitude)
- Post-clip L2 norm (shows clipping effect)
- Noise magnitude added per round
- Effective signal-to-noise ratio

**Impact:** ⭐⭐⭐ — Educational and diagnostic for DP researchers.

---

## 6. Communication Round Budget

**Problem:** Different algorithms use communication rounds very differently
but this is never visualised.

**Solution:** A "communication cost" tracker:
- Total bytes transmitted per round (weights × float64 × n_clients)
- Cumulative communication cost over all rounds
- Accuracy per unit communication cost (efficiency metric)
- Side-by-side comparison across algorithms

**Impact:** ⭐⭐⭐ — Important metric for FL systems research.

---

## 7. Cross-Silo vs Cross-Device Mode

**Problem:** The platform treats all scenarios the same — but hospital FL
(3 large clients) is fundamentally different from phone FL (1000 small clients).

**Solution:** Two deployment modes:

| Mode | Clients | Data per client | Use case |
|------|---------|-----------------|----------|
| Cross-silo | 2–20 | Large (10k+ rows) | Hospitals, banks |
| Cross-device | 100–1000 | Small (100 rows) | Mobile apps |

Cross-device mode uses:
- Client sampling (only 10% participate per round)
- Compressed updates (top-k sparsification)
- Asynchronous aggregation

**Impact:** ⭐⭐⭐⭐ — Doubles the research scenarios the platform covers.

---

## 8. Personalised Federated Learning (Per-FedAvg)

**Problem:** The global model may not perform well for individual clients
with unique data distributions.

**Solution:** Add Per-FedAvg — fine-tune the global model per client
using one gradient step:
```python
# After global aggregation
for client in clients:
    personal_w = gradient_step(global_w, client.X, client.y, lr=0.1)
    # evaluate personal_w on client's local test set
```
Show per-client accuracy before and after personalisation.

**Impact:** ⭐⭐⭐⭐ — Hot research topic, publishable results.

---

## 9. Federated Evaluation

**Problem:** The model is currently evaluated on a centralised test set,
which is unrealistic — in real FL there is no central test data.

**Solution:** Distributed evaluation:
- Each client evaluates the global model on its local held-out data
- Report per-client accuracy distribution (min, max, mean, std)
- Fairness metric: std of per-client accuracy (lower = more fair)

**Impact:** ⭐⭐⭐ — More realistic and academically rigorous.

---

## 10. Hyperparameter Search

**Problem:** Users must manually try different learning rates, rounds, etc.

**Solution:** Grid search over a small parameter space:
```
lr: [0.1, 0.3, 0.5]
rounds: [10, 20, 30]
local_epochs: [1, 3, 5]
```
Run all combinations (up to 27 experiments), rank by validation accuracy,
show the best config automatically.

**Impact:** ⭐⭐⭐ — Saves researchers hours of manual tuning.

---

## 11. Convergence Speed Metric

**Problem:** Users compare algorithms by final accuracy but not by how fast
they converge.

**Solution:** Auto-compute:
- Rounds to reach 80% of final accuracy
- Rounds to reach 90% of final accuracy
- Area under the accuracy curve (higher = faster convergence)

Show these in the Compare page table.

**Impact:** ⭐⭐⭐ — Adds a publishable benchmark metric.

---

## 12. Experiment Reproducibility

**Problem:** Two runs with the same config give different results because
the seed changes per run.

**Solution:**
- Store `run_seed` in experiment config (already done ✅)
- Add a "Reproduce" button that re-runs with the exact same seed
- Show a reproducibility badge when two runs produce identical results

**Impact:** ⭐⭐⭐ — Essential for scientific rigour.

---

## Implementation Priority

```
High priority (maximum research value):
  1. Privacy-utility trade-off visualisation
  2. Non-IID Dirichlet partition
  3. Client drop-out simulation
  4. Byzantine-robust aggregation (Krum)

Medium priority:
  5. Gradient norm monitoring
  6. Personalised FL (Per-FedAvg)
  7. Federated evaluation
  8. Cross-silo vs cross-device mode

Lower priority:
  9. Communication round budget
  10. Hyperparameter search
  11. Convergence speed metric
  12. Experiment reproducibility
```
