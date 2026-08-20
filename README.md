# FedShield — Full-Stack on Vercel (Python + React)

Single Vercel deployment: React frontend + Python serverless functions.

## Deploy
1. Push this repo to GitHub
2. vercel.com/new → import repo (root directory = .)
3. Add environment variables:
   - SUPABASE_URL
   - SUPABASE_ANON_KEY
   - ENCRYPTION_SECRET = fedshield-aes-secret-key-32chars!!
   - FRONTEND_URL = https://your-app.vercel.app
   - GOOGLE_CLIENT_ID (optional)
   - GOOGLE_CLIENT_SECRET (optional)
   - GOOGLE_REDIRECT_URI = https://your-app.vercel.app/api/auth/callback
4. Deploy

## Architecture
- /api/*.py  → Vercel Python 3.12 serverless functions
- /src/      → React 19 + Vite + Tailwind frontend
- Supabase   → PostgreSQL + Auth + Storage

## Super Admin
Sign up with sbhuvan847@gmail.com → auto-promoted via Supabase trigger.
