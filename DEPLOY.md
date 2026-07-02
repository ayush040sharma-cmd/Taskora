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
   | `FRONTEND_URL` | `https://taskora.io` |
   | `BACKEND_URL` | This service's own public URL — its Render URL, or `https://api.taskora.io` if that custom domain has been added in Render's Settings → Custom Domains |
   | `GOOGLE_CLIENT_ID` | From Google Cloud Console (see Section 4) |
   | `GOOGLE_CLIENT_SECRET` | From Google Cloud Console (see Section 4) |
   | `RESEND_API_KEY` | From [resend.com](https://resend.com) → API Keys (see Section 4b) |
   | `FROM_EMAIL` | `Taskora <support@taskora.io>` |
   | `EMAIL_REPLY_TO` | `support@taskora.io` |
   | `NODE_ENV` | `production` |

6. Deploy — note your Render URL. If you later add `api.taskora.io` as a
   custom domain in Render, update `BACKEND_URL` to match and redeploy.

---

## 3. Frontend — Vercel (free)

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Select the `frontend` folder as root directory
3. Add these **Environment Variables** in Vercel:

   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | Your Render backend URL, or `https://api.taskora.io` if that custom domain is configured |

4. Deploy, then in Vercel → Settings → Domains, add `taskora.io` as the
   production domain and follow Vercel's DNS instructions.

5. Go back to Render → update `FRONTEND_URL` to `https://taskora.io` and redeploy.

---

## 4. Google OAuth Setup (optional but recommended)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. New Project → "Taskora"
3. APIs & Services → OAuth consent screen:
   - App name: `Taskora`
   - Support email: `support@taskora.io`
   - Authorized domains: `taskora.io`
4. APIs & Services → Credentials → Create OAuth 2.0 Client ID:
   - Application type: Web application
   - Authorized redirect URIs: `{BACKEND_URL}/api/auth/google/callback`
     (the backend's actual public URL — Render URL or `https://api.taskora.io`)
5. Copy Client ID and Client Secret → paste into Render env vars
6. Add test users (your email) while app is in "Testing" mode

Without Google credentials, the "Continue with Google" button will return a 501 error — everything else still works.

**Important:** if `BACKEND_URL` ever changes (e.g. moving from the Render
subdomain to `api.taskora.io`), the redirect URI in the Google Cloud Console
must be updated to match, or Google sign-in will fail. This is a manual step
in Google's dashboard — it isn't controlled by any file in this repo.

---

## 4b. Email — Resend Setup

1. Go to [resend.com](https://resend.com) → Domains → Add `taskora.io`
2. Add the SPF, DKIM (and optionally DMARC) DNS records Resend gives you.
   **Emails from `support@taskora.io` will fail or be marked as spam until
   this domain is verified** — check the Resend dashboard for "Verified"
   status before relying on it in production.
3. Create an API key → set it as `RESEND_API_KEY` in Render.
4. Set `FROM_EMAIL="Taskora <support@taskora.io>"` and
   `EMAIL_REPLY_TO=support@taskora.io` in Render.
5. Until the domain is verified, either leave `RESEND_API_KEY` unset (invite
   and reset emails log their link to the Render logs instead of sending) or
   temporarily use Resend's shared `onboarding@resend.dev` sender for testing.

---

## 5. Custom domain

**Vercel**: Settings → Domains → Add `taskora.io`
**Render**: Settings → Custom Domains → Add `api.taskora.io` (optional — the
default Render subdomain works fine too, just update `BACKEND_URL`/`VITE_API_URL`
to whichever URL is actually live)

Update `FRONTEND_URL` and `BACKEND_URL` in Render to match your custom domains
after DNS propagates, and update `VITE_API_URL` in Vercel to match.

---

## 6. Error reporting — how users report bugs

When something crashes, Taskora shows:
- A friendly error screen with the specific error message
- **support@taskora.io** — direct email support
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
FRONTEND_URL=http://localhost:5173  # production: https://taskora.io
BACKEND_URL=http://localhost:3001   # production: this service's Render URL, or https://api.taskora.io
GOOGLE_CLIENT_ID=                   # optional
GOOGLE_CLIENT_SECRET=               # optional
RESEND_API_KEY=                     # from resend.com — required to actually send email
FROM_EMAIL="Taskora <support@taskora.io>"
EMAIL_REPLY_TO=support@taskora.io
NODE_ENV=development
```

### Frontend (.env.local for local, Vercel env vars for production)
```
VITE_API_URL=                       # leave blank for local (uses Vite proxy)
                                    # production: this backend's Render URL, or https://api.taskora.io
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

- Bugs: bugs@taskora.io or GitHub Issues
- Enterprise: enterprise@taskora.io
- General: support@taskora.io
