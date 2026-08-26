# FedShield — Privacy-Preserving Federated Learning Platform

FedShield is an enterprise-grade, full-stack privacy-preserving Federated Learning (FL) research workspace and demonstration platform. It enables collaborative machine learning model training across decentralized data nodes without requiring raw datasets to ever leave local client environments.

---

## Key Technical Features & Methodologies

### 1. Federated Learning Algorithms
Implemented from mathematical first-principles in pure Python without third-party ML framework overhead:

- **Centralized Baseline Training**: Standard centralized gradient descent serving as a upper-bound accuracy benchmark.
- **FedAvg (Federated Averaging)** *(McMahan et al., 2017)*: Iterative local client SGD updates with weighted global parameter aggregation:
  $$w_{t+1} = \sum_{k=1}^K \frac{n_k}{n} w_{t+1}^k$$
- **FedProx (Federated Proximal)** *(Li et al., 2018)*: Addresses statistical data heterogeneity (non-IID distribution across clients) by injecting a proximal regularization term to penalize local model drift:
  $$\min_{w} h_k(w; w_t) = f_k(w) + \frac{\mu}{2} \|w - w_t\|^2$$
- **SCAFFOLD** *(Karimireddy et al., 2020)*: Utilizes client and server control variates ($c_k, c$) to correct client drift caused by non-IID data distributions.
- **DP-SGD (Differentially Private SGD)** *(Abadi et al., 2016)*: Guarantees strict $(\varepsilon, \delta)$-differential privacy bounds by clipping gradient norms and injecting calibrated Gaussian noise during parameter updates to prevent membership inference attacks.

---

### 2. Cryptographic Security & Data Protection Architecture

- **Zero Raw-Data Egress**: Client datasets remain strictly local. Only model parameter gradients and weights are exchanged.
- **AES-256-GCM Encryption at Rest**: Trained model weights and sensitivity-cleared parameter updates are encrypted using **AES-256-GCM** with keys derived via **PBKDF2-HMAC-SHA256** (100,000 iterations) before persistence.
- **Row-Level Security (RLS)**: Database tables enforce strict PostgreSQL Row-Level Security policies to guarantee tenant multi-user data isolation.
- **Audit Logging**: Immutable, tamper-evident audit logging for all authentication, model execution, dataset access, and administration events.

---

### 3. Integrated AI Intelligence Agent
- Powered by **Google Gemini API** (`gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-1.5-pro`).
- Conversational assistant for dataset summarization, training performance analysis, and privacy budget explanations.
- Supports both system default API keys and user-configured custom API keys entered via the UI.

---

## Tech Stack & Architecture

- **Frontend**: React 19, Vite, TailwindCSS, Recharts (Real-Time Curves & Evaluation Analytics).
- **Backend API**: Python 3.12 (FastAPI / Serverless BaseHTTPRequestHandler).
- **Database & Auth**: Supabase (PostgreSQL), Google OAuth 2.0, Bearer JWT Authentication.
- **Deployment**: Vercel (Unified SPA Frontend + Python 3.12 Serverless API).

```
FedShield Platform
 ├── /src                       → React 19 Frontend UI & Dashboard
 │    ├── /components           → Layout, Navigation & AI Agent Widget
 │    ├── /context              → AuthContext & Session Management
 │    ├── /lib                  → API Client & Gemini Integration
 │    └── /pages                → Dashboard, Datasets, Train, Compare, Predict, Admin, System Health
 ├── /api                       → Python Backend Serverless Endpoints
 │    ├── /auth                 → Sign-in, Sign-up, Google OAuth Callback, Session endpoints
 │    ├── /core                 → AES-256-GCM Cryptography & Key Derivation
 │    ├── /datasets             → Dataset upload, indexing, and synthetic generation
 │    ├── /ml                   → Pure Python ML Algorithms (FedAvg, FedProx, SCAFFOLD, DP-SGD)
 │    ├── _shared.py            → Shared utilities, CORS headers, Vercel wrapper
 │    └── index.py              → Central Serverless API Router
 ├── local_api.py               → Local Python HTTP Server for Development
 └── vercel.json                → Deployment & Routing Configuration
```

---

## Quick Start & Local Setup

### Prerequisites
- **Node.js**: v18.x or higher
- **Python**: v3.12.x or higher

### 1. Repository Setup & Dependencies
```bash
git clone https://github.com/Bhuvan2110/FL-.git
cd FL-

# Install Node dependencies
npm install

# Install Python backend dependencies
pip install -r requirements.txt
```

### 2. Environment Configuration
Create a `.env` file in the root directory:

```env
# Supabase Database Configuration
SUPABASE_URL=https://<your-supabase-project-id>.supabase.co
SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>

# Encryption & Frontend URL
ENCRYPTION_SECRET=<your-32-character-secret-key>
FRONTEND_URL=http://localhost:5173

# Optional: Google OAuth Configuration
GOOGLE_CLIENT_ID=<your-google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<your-google-oauth-client-secret>
GOOGLE_REDIRECT_URI=http://localhost:5173/auth/callback

# Google Gemini API Key for AI Agent
VITE_GEMINI_API_KEY=<your-gemini-api-key>
```

### 3. Running Locally

Start the local Python API server and Vite frontend concurrently:

```bash
# Terminal 1: Start Python API Server (Port 8000)
npm run dev:api

# Terminal 2: Start Vite Dev Server (Port 5173)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser to access the FedShield workspace.

---

## Deployment on Vercel

1. Push your repository to GitHub.
2. Import the project into Vercel (`vercel.com/new`).
3. Add the required environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ENCRYPTION_SECRET`, `FRONTEND_URL`, `VITE_GEMINI_API_KEY`, etc.) in the Vercel Project Settings.
4. Deploy — Vercel will automatically package the React SPA frontend and Python 3.12 serverless backend routes.

---

## License

This project is open-source and available under the MIT License.
