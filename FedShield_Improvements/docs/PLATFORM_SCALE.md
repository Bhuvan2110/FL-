# FedShield — Platform & Scale

> Ideas to evolve FedShield from a single-user research tool into a
> collaborative, production-grade federated learning platform.

---

## 1. Collaborative Workspace (Multi-User Experiments)

**Problem:** Multiple researchers cannot collaborate on the same
experiment — each user works in complete isolation.

**Solution:** Shared experiment workspaces powered by Supabase Realtime:
- Create a "workspace" that multiple users can join
- All members see each other's training runs live
- Role-based permissions per workspace (owner, editor, viewer)
- Real-time notifications when a teammate's run completes

**Schema addition:**
```sql
CREATE TABLE workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  owner_id    UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE workspace_members (
  workspace_id UUID REFERENCES workspaces(id),
  user_id      UUID REFERENCES profiles(id),
  role         TEXT DEFAULT 'viewer',
  PRIMARY KEY (workspace_id, user_id)
);
```

**Impact:** ⭐⭐⭐⭐⭐ — Transforms FedShield from solo tool to team platform.

---

## 2. Experiment Queue (Background Job System)

**Problem:** Users must wait for each training run to finish before
starting the next one — no parallelism or queuing.

**Solution:** A job queue backed by Supabase:
- Submit multiple training jobs → they queue automatically
- Each job runs when the previous one completes (on Vercel) or in parallel (on dedicated infra)
- Queue status visible in a new "Queue" page
- Email notification when a queued job completes

**Queue states:**
```
pending → running → completed
                 → failed → retrying → failed (permanent)
```

**Impact:** ⭐⭐⭐⭐ — Enables overnight batch experiments.

---

## 3. MLflow-Compatible Export

**Problem:** Researchers who use MLflow, Weights & Biases, or
Neptune cannot import FedShield experiment data.

**Solution:** Export button that generates an MLflow-compatible artifact:
```json
{
  "experiment_id": "uuid",
  "run_id": "uuid",
  "params": {
    "algorithm": "fedavg",
    "rounds": 20,
    "lr": 0.4,
    "num_clients": 4
  },
  "metrics": {
    "accuracy": [0.71, 0.78, 0.84, 0.89, 0.91],
    "loss":     [0.61, 0.54, 0.48, 0.43, 0.39]
  },
  "tags": {
    "framework": "FedShield",
    "algorithm_type": "federated"
  },
  "artifacts": {
    "model_weights": "base64_encrypted_weights"
  }
}
```

**Impact:** ⭐⭐⭐⭐ — Makes FedShield interoperable with the ML ecosystem.

---

## 4. REST API with OpenAPI Documentation

**Problem:** Developers cannot integrate FedShield into their own
pipelines programmatically — there is no documented public API.

**Solution:**
- Auto-generated Swagger UI at `/docs`
- API key authentication (in addition to JWT)
- Rate-limited public endpoints for experiment results
- SDK generation (Python, JavaScript) via OpenAPI spec

**Example API usage:**
```python
import fedshield

client = fedshield.Client(api_key="fsk_...")
exp = client.train(
    dataset_id="uuid",
    algorithm="fedavg",
    rounds=20,
    lr=0.4
)
print(exp.metrics.accuracy)
```

**Impact:** ⭐⭐⭐⭐ — Enables CI/CD integration and programmatic access.

---

## 5. Prometheus Metrics Endpoint

**Problem:** Operations teams cannot monitor FedShield's health
and usage without custom tooling.

**Solution:** A `/api/metrics` endpoint in Prometheus exposition format:
```
# HELP fedshield_experiments_total Total number of experiments
# TYPE fedshield_experiments_total counter
fedshield_experiments_total{algorithm="fedavg",status="completed"} 42

# HELP fedshield_accuracy_histogram Model accuracy distribution
# TYPE fedshield_accuracy_histogram histogram
fedshield_accuracy_histogram_bucket{le="0.7"} 3
fedshield_accuracy_histogram_bucket{le="0.8"} 12
fedshield_accuracy_histogram_bucket{le="0.9"} 38

# HELP fedshield_privacy_budget_epsilon Latest epsilon spent
# TYPE fedshield_privacy_budget_epsilon gauge
fedshield_privacy_budget_epsilon{experiment="uuid"} 2.34
```

Pair with a Grafana dashboard template.

**Impact:** ⭐⭐⭐ — Standard observability for production deployments.

---

## 6. Email Notifications (Supabase Edge Functions + Resend)

**Problem:** Users have no way to know when a long training run
completes unless they keep the browser open.

**Solution:** Email notifications via Supabase Edge Functions + Resend:

**Trigger events:**
- Training run completed (with accuracy summary)
- Training run failed (with error message)
- Queued job started
- Another workspace member shared results

**Email template:**
```
Subject: FedShield — FedAvg training complete (91.4% accuracy)

Your experiment finished in 47 seconds.

Algorithm:  FedAvg
Accuracy:   91.4%
F1 Score:   0.903
AUC-ROC:    0.961

View results → https://your-app.vercel.app/runs
```

**Impact:** ⭐⭐⭐⭐ — Essential for long-running experiments.

---

## 7. Model Versioning

**Problem:** Every training run overwrites the previous model —
there is no way to roll back to an earlier version.

**Solution:** Full model version history:
- Each training run creates a new version (v1, v2, v3...)
- Version comparison: accuracy, F1, AUC side-by-side
- "Promote to production" button marks one version as the active model
- Rollback: one click to restore any previous version for inference

**Schema update:**
```sql
-- models table already has version INT
-- Add:
ALTER TABLE models ADD COLUMN is_active BOOLEAN DEFAULT false;
ALTER TABLE models ADD COLUMN promoted_at TIMESTAMPTZ;
ALTER TABLE models ADD COLUMN promoted_by UUID REFERENCES profiles(id);
```

**Impact:** ⭐⭐⭐⭐ — Standard ML engineering practice.

---

## 8. Multi-Dataset Experiments (True Cross-Silo FL)

**Problem:** All clients currently use partitions of the same dataset.
Real federated learning has each client holding a completely
different dataset (different hospitals with different patient records).

**Solution:**
- Upload multiple datasets (one per "client/silo")
- Assign each dataset to a client slot in the training config
- Each client trains on its own dataset independently
- Server only sees aggregated weights, never raw data

**UI change:** Replace "num_clients" slider with a client-dataset
assignment table where each row is a client and a dataset.

**Impact:** ⭐⭐⭐⭐⭐ — True federated learning simulation.

---

## 9. Horizontal Scaling (Edge Functions + Queues)

**Problem:** Vercel serverless functions have a 60-second timeout —
large datasets or many rounds will time out.

**Solution:** Offload heavy training to Supabase Edge Functions
or a dedicated worker:

**Architecture:**
```
User clicks "Train"
     ↓
Vercel /api/train  →  creates job in "training_queue" table
     ↓
Supabase Edge Function (pg_cron trigger every 30s)
     →  picks up pending jobs
     →  runs training
     →  writes results back to Supabase
     ↓
Frontend polls /api/experiments for status updates
```

This removes the 60-second limit entirely.

**Impact:** ⭐⭐⭐⭐⭐ — Enables training on large datasets with many rounds.

---

## 10. Docker Compose Self-Hosted Option

**Problem:** Some organisations (hospitals, government) cannot use
cloud platforms and need an on-premise deployment.

**Solution:** A `docker-compose.yml` that runs the full stack locally:

```yaml
version: '3.9'
services:
  api:
    build: ./backend
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
    ports:
      - "8000:8000"

  frontend:
    build: ./frontend
    environment:
      - VITE_API_URL=http://localhost:8000
    ports:
      - "3000:80"

  # Optional: local Supabase
  supabase:
    image: supabase/postgres:15
    ports:
      - "5432:5432"
```

**Impact:** ⭐⭐⭐⭐ — Opens the platform to regulated industries.

---

## 11. Usage Analytics Dashboard (Admin)

**Problem:** The super_admin has no insight into how the platform
is being used — which algorithms are most popular, what accuracy
ranges users are achieving, peak usage times.

**Solution:** An analytics dashboard visible only to super_admin:

```
┌──────────────────────────────────────────────────────┐
│  Platform Analytics (Last 30 days)                   │
├──────────────────┬───────────────────────────────────┤
│  Active users    │  47                               │
│  Experiments run │  312                              │
│  Avg accuracy    │  87.3%                            │
│  Most used algo  │  FedAvg (41%)                    │
│  DP-SGD runs     │  28 (avg ε = 3.1)                │
│  Peak hour       │  14:00–15:00 UTC                  │
└──────────────────┴───────────────────────────────────┘
```

Charts: daily active users, experiments by algorithm, accuracy
distribution histogram, privacy budget distribution.

**Impact:** ⭐⭐⭐ — Valuable for platform operators and grant reporting.

---

## 12. Publication-Ready Figure Export

**Problem:** Researchers need to put convergence charts and
comparison tables into IEEE/ACM papers but the charts are
web-only (Recharts SVG).

**Solution:**
- "Export for paper" button on Compare and Runs pages
- Exports charts as high-resolution PNG (300 DPI) or SVG
- Exports metrics tables as LaTeX (`\begin{tabular}...\end{tabular}`)
- Applies a clean academic figure style (white background, serif labels)

**LaTeX table example output:**
```latex
\begin{tabular}{lcccc}
\hline
Algorithm & Accuracy & F1 & AUC & Rounds \\
\hline
Central   & 91.2\%  & 0.908 & 0.961 & 30 \\
FedAvg    & 89.7\%  & 0.891 & 0.948 & 30 \\
FedProx   & 90.1\%  & 0.897 & 0.952 & 30 \\
SCAFFOLD  & 90.8\%  & 0.903 & 0.958 & 30 \\
FL+DP-SGD & 86.3\%  & 0.857 & 0.921 & 30 \\
\hline
\end{tabular}
```

**Impact:** ⭐⭐⭐⭐ — Directly supports academic publication workflow.

---

## Implementation Priority

```
Critical (enables real-world use):
  1. Experiment queue (remove 60s timeout)
  2. Multi-dataset cross-silo FL
  3. Horizontal scaling via Supabase Edge Functions

High priority (team collaboration):
  4. Collaborative workspace (multi-user)
  5. Email notifications
  6. Model versioning
  7. REST API + OpenAPI docs

Medium priority (ecosystem integration):
  8. MLflow-compatible export
  9. Publication-ready figure export
  10. Usage analytics dashboard

Lower priority (enterprise):
  11. Docker Compose self-hosted option
  12. Prometheus metrics endpoint
```
