# Deploying VibeBin v2 to Vercel

This is the full step-by-step. Your previous deployment already had the
base env vars (`DATABASE_URL` and `AUTH_SECRET`) — you only need to add
**one new variable** for the admin panel.

## 0. Pull the latest code

The PR is at: **https://github.com/harshi79/paste-view-alternative/pull/2**

Either merge it on GitHub and let Vercel auto-deploy, **or** make Vercel
deploy the branch directly:

1. Go to https://vercel.com → your VibeBin project.
2. Settings → Git → "Production Branch" → change to
   `arena/01a048ff-paste-view-alternative` (or merge PR #2 into `main` first,
   whichever you prefer).
3. Save. Vercel will start a new deployment.

> If you don't merge first, your production URL will keep running the old
> code. So either merge the PR or re-point the production branch.

## 1. The environment variables you need

Vercel → your project → **Settings** → **Environment Variables**.

| Name                | Value                              | Which envs          | Notes                                                                                              |
| ------------------- | ---------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | *(already set)*                    | Production, Preview | Your Neon **pooled** connection string. Leave as is.                                              |
| `AUTH_SECRET`       | *(already set)*                    | Production, Preview | The JWT signing secret. Leave as is.                                                               |
| **`ADMIN_PASSWORD`**| *(you pick this)*                  | Production, Preview | **NEW.** Any long string you want. This unlocks `/admin`. It is never committed to the repo.       |

### How to set the new variable

1. Vercel → your project → **Settings** → **Environment Variables**.
2. Click **Add New**.
3. **Name**: `ADMIN_PASSWORD` (exact spelling, all caps, underscore).
4. **Value**: anything you want, e.g. `super-secret-admin-2026-x9f2`. Treat
   it like a password — long, random, don't share it.
5. Tick **Production**, **Preview**, and (optionally) **Development**.
6. Click **Save**.

> You do **not** need to change `DATABASE_URL` or `AUTH_SECRET`. They're
> already configured from v1 and the schema auto-migrates on first request.

## 2. Verify the env var is set

After saving, on the same page you should see a row like:

```
ADMIN_PASSWORD    Production, Preview, Development    xxxxxxxxxxxx
```

If you don't see it, the deployment won't have access to it — Vercel only
exposes variables that exist on the project when the deployment starts.

## 3. Redeploy

Vercel → your project → **Deployments** → on the latest deployment click
the three-dot menu → **Redeploy**.

(Or just merge the PR — Vercel will auto-build.)

Wait for the build to finish (1–2 minutes). Open the deployment URL.

## 4. Confirm everything works

Open the home page of your deployment. You should see:

- The new plain/rich editor tabs.
- "Create a free account" link below the editor.

Test the admin panel:

1. Visit `https://YOUR-DOMAIN/admin/login` — you should get a password
   prompt (NOT a 404 or a "not configured" error).
2. Type the `ADMIN_PASSWORD` you set in step 1. Click **Sign in**.
3. You land on `/admin` with stats and four cards (Users / Tags /
   Stickers — the 4th is "Overview", which is the page you're on).
4. Go to **Tags** → create a "Founder" tag with a yellow color and the
   `gold` effect.
5. Go to **Users** → click your own account → click the "Founder" tag to
   assign it. A toast says "Assigned".
6. Open your public profile (`/u/your-username`) — the gold "Founder"
   tag should appear under your name.

## 5. What changed in your database (nothing to do)

On the first request after redeploy, the app runs these idempotent
statements (so they are safe to run against your existing Neon DB):

- `ALTER TABLE users ADD COLUMN IF NOT EXISTS username_changed_at`
- `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS effect_speed`
- `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS effect_intensity`
- `ALTER TABLE pastes ADD COLUMN IF NOT EXISTS format`
- New `signup_ips`, `tags`, `user_tags`, `stickers` tables
- New case-insensitive unique index on `users.username`

Your existing data is untouched.

## 6. Quick troubleshooting

| Symptom                                                                  | Fix                                                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `/admin/login` says "ADMIN_PASSWORD is not set on the server."          | The env var wasn't saved or you forgot to redeploy. Save it and redeploy.             |
| Build fails with a Type error.                                          | Pull the latest branch. The code on `main` does not have v2 — v2 is on the new branch/PR. |
| 3rd account from your IP gets "You can only create 3 accounts…"          | That's working as designed. Use a different network or VPN to test.                  |
| `notFound()` after registering a new account on a deployed Vercel URL    | Make sure your Neon **pooled** connection string is the one in `DATABASE_URL`.       |
| Tag you assigned to a user doesn't show on their profile                 | Hard refresh (Ctrl+Shift+R). The page is `dynamic = 'force-dynamic'`.                |

## 7. Keeping Neon awake (first-load slowness)

**Yes — a slow first load is almost always Neon's free tier putting the
database compute to sleep** after ~5 minutes of no connections. When a
visitor hits the site, their request has to wake the database first, which
adds a few seconds. This is normal for free Neon and not a code bug.

We've shipped three things to make this better:

1. **`/api/ping`** — a tiny health-check endpoint that runs a trivial
   `SELECT 1` against the DB. Hitting it on an interval keeps the compute
   warm, so real visitors get an instant response.
2. **`vercel.json` cron** — Vercel runs `/api/ping` every **5 minutes** on
   the Hobby plan for free. Just redeploy with the new `vercel.json` and
   the cron is created automatically (check Project → Settings → Cron Jobs).
3. **Faster cold starts** — the DB layer now does a single cheap
   "does `users` exist?" check and only runs the full schema on a truly
   fresh database, skipping ~15 DDL round-trips on every serverless cold
   start. Existing deployments only run the small idempotent `ALTER`s.

### Optional: keep it warm with an external uptime monitor

If you'd rather not rely on Vercel's cron, point a free uptime monitor
(UptimeRobot, Cronitor, etc.) at `https://YOUR-DOMAIN/api/ping` every
5–10 minutes. Same effect, works on any host.

> Note: Vercel Hobby builds are still serverless — each idle function
> instance can go cold, but the **database** (the slow part) stays warm as
> long as `/api/ping` keeps firing. First-load after a long idle may still
> re-init a function; that's a few hundred ms, not seconds.

## 8. Local dev (optional)

```bash
git fetch
git checkout arena/01a048ff-paste-view-alternative
npm install
ADMIN_PASSWORD=anything npm run dev
# open http://localhost:3000
# open http://localhost:3000/admin/login
```

Without `DATABASE_URL`, the app uses a local PGlite database stored in
`.pglite-data/`. Without `ADMIN_PASSWORD`, the admin login page shows a
"not configured" warning.
