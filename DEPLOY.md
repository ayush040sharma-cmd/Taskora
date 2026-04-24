# Taskora — Deployment Guide

This guide covers how to deploy Taskora so real users can access it.
Recommended stack: **Vercel (frontend) + Render (backend) + Supabase (database)** — all have free tiers.

---

## 1. Database — Supabase (free)

1. Go to [supabase.com](https://supabase.com) → New project
2. Copy the **Connection string** (looks like `postgresql://postgres:[password]@db.xxxx.supabase.co:5432/postgres`)
3. In the Supabase SQL editor, run the schema files **in order**:
   ```
   backend/schema.sql
   backend/schema-v2.sql
   backend/schema-v3.sql
   backend/schema-v4.sql
   backend/schema-v5.sql
   backend/schema-v6.sql
   backend/schema-v7.sql
   backend/schema-v8.sql   ← important: fixes type/status constraints
   ```

---

## 2. Backend — Render (free)

1. Push this repo to GitHub (if not already)
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo → select the `backend` folder as root
4. Settings:
   - **Build command**: `npm install`
   - **Start command**: `node server.js`
   - **Environment**: Node

5. Add these **Environment Variables** in Render:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | Your Supabase connection string |
   | `JWT_SECRET` | Any random 32+ char string (e.g. `openssl rand -hex 32`) |
   | `PORT` | `3001` |
   | `FRONTEND_URL` | Your Vercel URL (e.g. `https://taskora.vercel.app`) |
   | `BACKEND_URL` | Your Render URL (e.g. `https://taskora-api.onrender.com`) |
   | `GOOGLE_CLIENT_ID` | From Google Cloud Console (see Section 4) |
   | `GOOGLE_CLIENT_SECRET` | From Google Cloud Console (see Section 4) |
   | `NODE_ENV` | `production` |

6. Deploy — note your Render URL (e.g. `https://taskora-api.onrender.com`)

---

## 3. Frontend — Vercel (free)

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Select the `frontend` folder as root directory
3. Add these **Environment Variables** in Vercel:

   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | Your Render backend URL (e.g. `https://taskora-api.onrender.com`) |

4. Deploy — note your Vercel URL (e.g. `https://taskora.vercel.app`)

5. Go back to Render → update `FRONTEND_URL` to your Vercel URL and redeploy.

---

## 4. Google OAuth Setup (optional but recommended)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. New Project → "Taskora"
3. APIs & Services → OAuth consent screen:
   - App name: `Taskora`
   - Support email: `support@taskora.app`
   - Authorized domains: `taskora.vercel.app` (your Vercel domain)
4. APIs & Services → Credentials → Create OAuth 2.0 Client ID:
   - Application type: Web application
   - Authorized redirect URIs: `https://taskora-api.onrender.com/api/auth/google/callback`
5. Copy Client ID and Client Secret → paste into Render env vars
6. Add test users (your email) while app is in "Testing" mode

Without Google credentials, the "Continue with Google" button will return a 501 error — everything else still works.

---

## 5. Custom domain (optional)

**Vercel**: Settings → Domains → Add `taskora.app` (or your domain)
**Render**: Settings → Custom Domains

Update `FRONTEND_URL` in Render to match your custom domain after DNS propagates.

---

## 6. Error reporting — how users report bugs

When something crashes, Taskora shows:
- A friendly error screen with the specific error message
- **support@taskora.app** — direct email support
- Link to GitHub Issues for bug reports

Users can also use the **Contact** page at `/contact` with a subject dropdown including "Bug report".

---

## 7. Final checklist before going live

- [ ] Run `backend/schema-v8.sql` in your production database
- [ ] `JWT_SECRET` is set to a strong random string (not the default)
- [ ] `FRONTEND_URL` and `BACKEND_URL` env vars match your deployed URLs
- [ ] Test demo login at `/login` → "Try with demo account"
- [ ] Test regular registration at `/register`
- [ ] Test Google OAuth if credentials are configured
- [ ] Verify `/about`, `/contact`, `/privacy`, `/terms` all load
- [ ] Check `/health` endpoint returns `{"status":"ok","database":"ok"}`

---

## 8. Environment variables reference

### Backend (.env for local, Render env vars for production)
```
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-here
PORT=3001
FRONTEND_URL=http://localhost:5173  # or your Vercel URL
BACKEND_URL=http://localhost:3001   # or your Render URL
GOOGLE_CLIENT_ID=                   # optional
GOOGLE_CLIENT_SECRET=               # optional
NODE_ENV=development
```

### Frontend (.env.local for local, Vercel env vars for production)
```
VITE_API_URL=                       # leave blank for local (uses Vite proxy)
                                    # set to https://taskora-api.onrender.com for prod
```

---

## 9. Local development (reminder)

```bash
# Terminal 1 — backend
cd backend
npm install
node server.js        # runs on :3001

# Terminal 2 — frontend
cd frontend
npm install
npm run dev           # runs on :5173, proxies /api → :3001
```

Open http://localhost:5173 — everything routes through the Vite proxy.

---

## Support

- Bugs: bugs@taskora.app or GitHub Issues
- Enterprise: enterprise@taskora.app
- General: support@taskora.app
