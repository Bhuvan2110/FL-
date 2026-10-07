# FedShield — Full TypeScript Rewrite

Both the frontend (already TypeScript from an earlier pass) and the
**backend** (previously Python/FastAPI) are now TypeScript — Node/Express
on the server, React on the client, one language end to end.

## Read this before trusting anything below

This rewrite happened across a session where the build sandbox reset
partway through, twice. That matters for how much to trust different
parts of this zip:

| Part | Status |
|---|---|
| **ML algorithms** (`server/ml/*.ts`) | Reimplemented from the published papers (FedAvg/FedProx/SCAFFOLD/Krum/DP-SGD), not ported from code — the original Python math was only viewed once, early in the session, and that output was pruned before this rewrite started. Function signatures and behavior match what the rest of the system expects; the internal math is a correct-by-spec reimplementation, not a verified line-for-line port. All 11 ML tests pass, including real convergence checks (not just "doesn't crash"). |
| **Backend routes/schemas/encryption** (`server/routes/*.ts`, `schemas.ts`, `core/encryption.ts`) | Ported faithfully — this code was written by the same assistant earlier in the *same* conversation and that content was still available verbatim. |
| **Frontend** (`src/`) | Same situation — recreated from this conversation's own earlier output, verbatim. |
| **`tailwind.config.js`, `index.css`, `postcss.config.js`, `index.html`** | **Reconstructed, not recovered.** These were only ever briefly glimpsed (one `cp` command, 10 lines shown) before being pruned. What's here is a consistent, working dark theme covering every custom class name the components actually reference (`.panel`, `.btn-primary`, `font-headline-xl`, the full color palette, etc.) — it compiles and renders correctly, but the exact original hex values and spacing are not guaranteed to match what shipped before. |
| **`public/tiger_avatar.jpg`** | Missing — binary image data can't be reconstructed from text context. A placeholder note is left at `public/tiger_avatar.README.txt`; drop your own image at `public/tiger_avatar.jpg` (used by the AI chat widget's avatar). |

If pixel-exact visual fidelity to a specific earlier version matters, treat
the CSS/config layer here as a solid *new* default rather than a restoration.

## What changed from the Python version

| Before (Python/FastAPI) | After (TypeScript/Express) |
|---|---|
| `fastapi` + Pydantic | `express` + `zod` |
| `supabase-py` | `@supabase/supabase-js` |
| `cryptography` (AES-256-GCM via PyCA) | Node's built-in `crypto` module (AES-256-GCM) — ciphertext+tag concatenation convention preserved |
| Pure-Python ML (`ml/*.py`) | Pure-TypeScript ML (`server/ml/*.ts`) — same zero-library constraint |
| `pytest` | `vitest` + `supertest` |
| `uvicorn` | `tsx` (dev) / Vercel's Node runtime (prod) |

Route paths, request/response shapes, and error format (`{error, detail}`)
are all unchanged — the frontend needed zero changes for this swap.

## Project layout

```
server/
  app.ts              Express app — CORS, routing, error handling
  config.ts           Env config (zod-validated)
  db.ts               Supabase client factories
  dev-server.ts        Local dev entrypoint (npm run dev:api)
  core/encryption.ts   AES-256-GCM (Node crypto)
  ml/                  logistic.ts, algorithms.ts, metrics.ts
  middleware/auth.ts    requireAuth, requireAdmin, audit logging
  routes/               health, auth, datasets, experiments, train, predict, compare, admin
  schemas.ts            zod request validation
  **/__tests__/         vitest suites (26 tests)
api/index.ts            Vercel entrypoint — Express app IS the handler
src/                    React + TypeScript frontend (unchanged structure)
tsconfig.json            Frontend TS config
tsconfig.server.json      Backend TS config (separate — different target env)
vitest.config.ts          Frontend test config
vitest.server.config.ts    Backend test config
vercel.json               Rewrites /api/* to the one Node function
```

## Known implementation choices (where no original existed to match)

- **DP-SGD privacy accounting**: uses the advanced-composition bound
  `ε(t) = sqrt(2·t·ln(1.25/δ)) / σ` — the same simplified formula the
  frontend already estimated with client-side. Not a tight moments/RDP
  accountant; documented in `server/ml/algorithms.ts`.
- **Platt scaling**: fit via plain gradient descent on the calibration
  set (`server/ml/metrics.ts`) — a standard, correct approach, but the
  exact original fitting procedure wasn't available to match.
- **Krum's Byzantine-tolerance assumption**: assumes ~20% of clients
  could be adversarial (`f = floor(0.2 × n_clients)`) — a reasonable
  default per the paper, not necessarily the original's exact value.

None of these affect correctness of the end result — just noting where
"this is *a* correct implementation" rather than "this is verified
identical to what was there before."

## Running locally

```bash
npm install
cp .env.example .env   # fill in your Supabase project details

npm run dev:api    # Express backend on :8000
npm run dev          # Vite frontend on :5173, proxies /api to :8000
```

## Running tests

```bash
npm run test:all   # typecheck both + frontend tests + backend tests
```

Or individually: `npm run typecheck`, `npm run typecheck:server`, `npm test`, `npm run test:server`.

**Verified before packaging** (not just asserted): backend typecheck
clean, 26/26 backend tests pass (including every FL algorithm actually
converging above chance accuracy on synthetic data), frontend typecheck
clean, 36/36 frontend tests pass, `vite build` succeeds, and the Vercel
entrypoint (`api/index.ts`) was confirmed to import and resolve correctly.

## Deploying

Same model as before: Vercel, `vercel.json` routes every `/api/*`
request to the one `api/index.ts` function — which now works because
an Express app is directly callable as `(req, res) => void`, exactly
the contract Vercel's Node runtime expects. No adapter library needed.

## OAuth note (carried forward from the prior session)

Google sign-in uses Supabase's *implicit* flow for this project, which
returns the session token in the URL fragment (`#access_token=...`) —
never sent to any server. `redirect_to` points at the frontend's
`/auth/callback` route, and `AuthContext.tsx` parses the token from the
URL on mount. Supabase's dashboard redirect-URL allow-list must include
that frontend URL or the sign-in will be rejected before it reaches
this code at all.
