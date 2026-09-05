# FedShield — UX Improvements

> Ideas to make FedShield more intuitive, responsive, and enjoyable for researchers and developers.

---

## 1. Real-Time Training Progress (SSE Streaming)

**Problem:** Users currently wait 30–60 seconds with no feedback while Python trains the model.

**Solution:** Replace POST + wait with Server-Sent Events (SSE) so each round streams live to the frontend.

**Implementation:**
- FastAPI `StreamingResponse` with `text/event-stream`
- Frontend `EventSource` or `fetch` + `ReadableStream`
- Live updating Recharts `LineChart` per round

**Impact:** ⭐⭐⭐⭐⭐ — Biggest single UX win in the entire platform.

---

## 2. Training Presets

**Problem:** Users must manually configure 6–8 parameters before every training run.

**Solution:** Quick-pick preset buttons:

| Preset | Rounds | LR | Clients | Use case |
|--------|--------|----|---------|----------|
| Fast | 10 | 0.5 | 3 | Quick prototype |
| Balanced | 20 | 0.4 | 4 | Standard research |
| Thorough | 30 | 0.3 | 6 | Publication quality |
| Privacy-first | 20 | 0.4 | 4 | DP-SGD with tight ε |

**Impact:** ⭐⭐⭐⭐ — Removes friction for new users.

---

## 3. Dataset Statistics Preview

**Problem:** Users upload a CSV and immediately train without understanding their data.

**Solution:** Show a statistics panel before training:
- Class distribution bar chart (balanced vs imbalanced)
- Feature correlation heatmap
- Missing value summary
- Recommended algorithm based on dataset size

**Impact:** ⭐⭐⭐⭐ — Prevents bad experiments from bad data.

---

## 4. Algorithm Comparison Wizard

**Problem:** Users must manually run each algorithm separately and then switch to Compare page.

**Solution:** A one-click wizard that:
1. Takes one dataset
2. Runs all 5 algorithms with same config
3. Shows side-by-side results automatically
4. Highlights the winner per metric

**Impact:** ⭐⭐⭐⭐⭐ — Core research value, very compelling demo feature.

---

## 5. Mobile Responsive Layout

**Problem:** The sidebar and data tables break on screens narrower than 768px.

**Solution:**
- Collapsible hamburger sidebar on mobile
- Horizontal scrolling data tables with sticky first column
- Stacked card layout for metrics on small screens
- Touch-friendly button sizes (min 44px)

**Impact:** ⭐⭐⭐ — Important for accessibility and wider adoption.

---

## 6. Model Download / Export

**Problem:** Users cannot take their trained model outside the platform.

**Solution:** Export button on Predict page that downloads:
```json
{
  "algorithm": "fedavg",
  "weights": { "w": [...], "b": 0.042 },
  "feature_cols": ["age", "income", ...],
  "norm_stats": { ... },
  "metrics": { "accuracy": 0.94, "auc": 0.97 }
}
```

**Impact:** ⭐⭐⭐⭐ — Makes FedShield interoperable with real pipelines.

---

## 7. Training History Persistence

**Problem:** Refreshing the browser during or after training loses the progress display.

**Solution:**
- Save round history to `localStorage` keyed by `experiment_id`
- On page load, restore the last training chart automatically
- Clear after 24 hours

**Impact:** ⭐⭐⭐ — Prevents frustrating data loss on accidental refresh.

---

## 8. Onboarding Tour

**Problem:** New users land on the dashboard with no guidance on what to do first.

**Solution:** A 5-step guided tour on first login:
1. Generate a synthetic dataset
2. Pick an algorithm
3. Run training
4. View results on Compare
5. Run a prediction

**Technology:** `driver.js` or `react-joyride`

**Impact:** ⭐⭐⭐ — Dramatically reduces time-to-first-value for new users.

---

## 9. Dark / Light Theme Toggle

**Problem:** The platform is dark-only; some users prefer light mode.

**Solution:**
- CSS variable swap via Tailwind `dark:` classes
- Persisted in `localStorage`
- System preference detection via `prefers-color-scheme`

**Impact:** ⭐⭐ — Accessibility improvement.

---

## 10. Keyboard Shortcuts

**Problem:** Power users have to click through the UI for every action.

**Solution:**
| Shortcut | Action |
|----------|--------|
| `G D` | Go to Dashboard |
| `G T` | Go to Train |
| `G C` | Go to Compare |
| `R` | Run training (when on Train page) |
| `?` | Show shortcut help |

**Impact:** ⭐⭐ — Productivity boost for frequent users.

---

## Implementation Priority

```
High priority (build first):
  1. Real-time SSE training progress
  2. Algorithm comparison wizard
  3. Dataset statistics preview
  4. Training presets

Medium priority:
  5. Mobile responsive layout
  6. Model download/export
  7. Training history persistence

Lower priority:
  8. Onboarding tour
  9. Dark/light theme
  10. Keyboard shortcuts
```
