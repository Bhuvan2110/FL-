# FedShield — Security & Compliance

> Ideas to make FedShield production-ready for regulated industries
> such as healthcare, finance, and government research.

---

## 1. Differential Privacy Audit Report (PDF)

**Problem:** After a DP-SGD run, users have no formal document proving
the privacy guarantees — required for HIPAA, GDPR, and IRB submissions.

**Solution:** Auto-generate a PDF privacy report after each DP-SGD run containing:

```
┌─────────────────────────────────────────────┐
│  FedShield Privacy Audit Report             │
│  Experiment: exp-uuid                       │
├─────────────────────────────────────────────┤
│  Algorithm:        FL + DP-SGD              │
│  Privacy Budget:   ε = 2.34, δ = 1e-5      │
│  Noise Multiplier: σ = 1.1                  │
│  Clip Norm:        C = 1.0                  │
│  Training Rounds:  T = 20                   │
│  Mechanism:        Gaussian (approximate)   │
├─────────────────────────────────────────────┤
│  Plain-English Interpretation:              │
│  "With 95% probability, an attacker         │
│   cannot determine whether any single       │
│   individual's data was used in training."  │
├─────────────────────────────────────────────┤
│  Model Accuracy:   91.4%                    │
│  Privacy Cost:     2.34 ε                   │
│  Privacy-Utility:  High                     │
└─────────────────────────────────────────────┘
```

**Technology:** Python `reportlab` or `weasyprint` serverless function.

**Impact:** ⭐⭐⭐⭐⭐ — Makes FedShield deployable in real hospital/finance settings.

---

## 2. Two-Factor Authentication (TOTP)

**Problem:** Admin and super_admin accounts are protected only by password.
A compromised password exposes all user data and experiments.

**Solution:** TOTP-based 2FA via Supabase Auth MFA:
- Enable in Supabase Dashboard → Auth → MFA
- QR code enrollment on first admin login
- TOTP prompt on every admin sign-in
- Backup recovery codes stored encrypted

**Affected roles:** `admin`, `super_admin` (mandatory), `user` (optional)

**Impact:** ⭐⭐⭐⭐⭐ — Essential for production security.

---

## 3. Session Timeout & Inactivity Lock

**Problem:** A user who walks away from their browser leaves their
encrypted models and sensitive data exposed.

**Solution:**
- Auto sign-out after 30 minutes of inactivity
- 5-minute warning dialog: "Your session expires in 5 minutes"
- Lock screen (blur overlay) after 15 minutes with re-auth prompt
- Configurable timeout per role (shorter for admins)

**Implementation:**
```javascript
// Track last activity
document.addEventListener('mousemove', resetTimer)
document.addEventListener('keypress', resetTimer)

// Sign out after timeout
setTimeout(() => signOut(), 30 * 60 * 1000)
```

**Impact:** ⭐⭐⭐⭐ — Required for HIPAA workstation compliance.

---

## 4. Model Poisoning Detection

**Problem:** A malicious client can send crafted gradient updates
to corrupt the global model or embed a backdoor.

**Solution:** Per-round anomaly detection on client updates:
- Compute L2 norm of each client's update
- Flag clients whose update norm exceeds mean + 2σ
- Log flagged clients to audit trail
- Option: exclude flagged clients from that round's aggregation

**Detection methods (from scratch):**
```python
def detect_poisoning(client_updates):
    norms = [l2_norm(u['w']) for u in client_updates]
    mean_norm = sum(norms) / len(norms)
    std_norm  = std(norms)
    flagged   = [i for i, n in enumerate(norms)
                 if n > mean_norm + 2 * std_norm]
    return flagged
```

**Impact:** ⭐⭐⭐⭐ — Critical for untrusted client scenarios.

---

## 5. Audit Log Export (CSV/PDF)

**Problem:** Admins cannot currently export the audit trail for
compliance reporting or external review.

**Solution:**
- "Export audit log" button on the Audit page
- Filters: date range, action type, user
- Export formats: CSV (for analysis), PDF (for submission)
- Tamper-evident: each export includes a SHA-256 hash of the log contents

**Use cases:**
- GDPR data access requests
- SOC 2 audit evidence
- IRB (Institutional Review Board) submissions

**Impact:** ⭐⭐⭐⭐ — Required for regulated industry deployment.

---

## 6. Data Retention & Right to Erasure

**Problem:** GDPR Article 17 requires the ability to delete all
data associated with a user on request.

**Solution:** "Delete my account" flow:
1. User requests account deletion
2. System deletes: profile, datasets (Storage), experiments, models,
   predictions, privacy_budget, audit_logs
3. Supabase Auth account deleted
4. Confirmation email sent
5. Super admin receives notification

**Cascade delete SQL:**
```sql
CREATE OR REPLACE FUNCTION delete_user_data(uid UUID)
RETURNS void AS $$
BEGIN
  DELETE FROM predictions  WHERE user_id = uid;
  DELETE FROM models       WHERE experiment_id IN
    (SELECT id FROM experiments WHERE user_id = uid);
  DELETE FROM experiments  WHERE user_id = uid;
  DELETE FROM datasets     WHERE user_id = uid;
  DELETE FROM audit_logs   WHERE user_id = uid;
  DELETE FROM profiles     WHERE id = uid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Impact:** ⭐⭐⭐⭐ — Legal requirement under GDPR.

---

## 7. Rate Limiting

**Problem:** The training endpoint has no rate limit — a user could
spam 100 training requests simultaneously, exhausting Vercel function limits.

**Solution:**
- Per-user rate limit: 5 training runs per 10 minutes
- Per-IP rate limit: 20 API calls per minute
- Returns HTTP 429 with `Retry-After` header
- Rate limit state stored in Supabase (no Redis needed on Vercel)

```python
def check_rate_limit(user_id, action, limit, window_seconds):
    db = get_db()
    cutoff = datetime.utcnow() - timedelta(seconds=window_seconds)
    count = db.from_("audit_logs") \
        .select("id", count="exact") \
        .eq("user_id", user_id) \
        .eq("action", action) \
        .gte("created_at", cutoff.isoformat()) \
        .execute()
    return (count.count or 0) >= limit
```

**Impact:** ⭐⭐⭐⭐ — Prevents abuse and cost overruns.

---

## 8. Input Validation & Sanitisation

**Problem:** Training config inputs (learning rate, rounds, etc.) are
cast directly from JSON with minimal validation, allowing edge cases
like `lr = 999` or `rounds = 0`.

**Solution:** Strict Pydantic validation on all API inputs:
```python
class TrainRequest(BaseModel):
    rounds:          int   = Field(ge=5,    le=30)
    lr:              float = Field(ge=0.001, le=2.0)
    num_clients:     int   = Field(ge=2,    le=12)
    local_epochs:    int   = Field(ge=1,    le=10)
    clip_norm:       float = Field(ge=0.1,  le=10.0)
    noise_multiplier:float = Field(ge=0.5,  le=5.0)
```

Add CSV sanitisation to reject files containing:
- More than 50,000 rows
- More than 100 columns
- Non-numeric values in feature columns

**Impact:** ⭐⭐⭐ — Prevents crashes and unexpected behaviour.

---

## 9. Encrypted Storage at Rest

**Problem:** Model weights are encrypted (AES-256-GCM ✅) but raw
dataset files in Supabase Storage are stored in plaintext.

**Solution:** Encrypt dataset files before uploading to Storage:
```python
def upload_encrypted_dataset(rows, user_id, filename):
    passphrase = f"{ENCRYPTION_SECRET}:{user_id}:dataset"
    ct, iv = encrypt_json({"rows": rows}, passphrase)
    storage.upload(f"{user_id}/{filename}", json.dumps({"ct": ct, "iv": iv}))
```

Decrypt on the way out before training.

**Impact:** ⭐⭐⭐ — Defence-in-depth if Supabase Storage is compromised.

---

## 10. Content Security Policy (CSP)

**Problem:** No CSP headers are set, leaving the app vulnerable to
Cross-Site Scripting (XSS) attacks.

**Solution:** Add strict CSP via Vercel headers in `vercel.json`:
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co; img-src 'self' data:"
        },
        { "key": "X-Frame-Options",        "value": "DENY" },
        { "key": "X-Content-Type-Options",  "value": "nosniff" },
        { "key": "Referrer-Policy",         "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy",      "value": "camera=(), microphone=(), geolocation=()" }
      ]
    }
  ]
}
```

**Impact:** ⭐⭐⭐ — Blocks XSS, clickjacking, and MIME-sniffing attacks.

---

## 11. GDPR Consent Banner

**Problem:** No cookie/data consent mechanism exists for EU users.

**Solution:**
- First-visit consent banner
- Separate toggles for: Essential (required), Analytics (optional)
- Consent stored in localStorage, respected by all tracking
- Privacy policy page at `/privacy`

**Impact:** ⭐⭐⭐ — Legal requirement for EU deployment.

---

## 12. Penetration Testing Checklist

**Problem:** The platform has never been formally security-tested.

**Solution:** Run these checks before production:

```
Authentication:
  □ SQL injection via email field
  □ JWT token forgery attempt
  □ Brute-force login (should trigger rate limit)
  □ Token replay after signout

Authorisation:
  □ Access another user's experiments via direct ID
  □ Access admin endpoints as regular user
  □ Modify another user's dataset via API

Data:
  □ Upload malicious CSV (formula injection: =CMD())
  □ Upload oversized file (>10MB)
  □ Train on dataset belonging to another user

Crypto:
  □ Decrypt model with wrong user_id passphrase
  □ Modify encrypted weights in DB (should fail on decrypt)
```

**Impact:** ⭐⭐⭐⭐⭐ — Required before any real-world deployment.

---

## Implementation Priority

```
Critical (before production):
  1. Differential Privacy PDF report
  2. Two-Factor Authentication
  3. Rate limiting
  4. Penetration testing checklist

High priority:
  5. Session timeout
  6. Model poisoning detection
  7. Audit log export
  8. Input validation hardening

Medium priority:
  9. GDPR right to erasure
  10. Dataset encryption at rest
  11. Content Security Policy headers
  12. GDPR consent banner
```
