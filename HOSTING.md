# Deploying VibeBin to Vercel

This is the full step-by-step for deploying VibeBin to Vercel with a
**Turso** (libSQL/SQLite) database.

> Migration note: VibeBin previously ran on Neon PostgreSQL. The current
> runtime uses Turso exclusively — there is no `DATABASE_URL`/Neon setup
> anymore. If you still have Neon variables configured on your Vercel
> project, you can leave them in place (they are ignored), but the variables
> that actually matter are the Turso ones below.

## 1. The environment variables you need

Vercel → your project → **Settings** → **Environment Variables**.

| Name                  | Value                                         | Which envs          | Notes                                                                  |
| --------------------- | --------------------------------------------- | ------------------- | ---------------------------------------------------------------------- |
| `TURSO_DATABASE_URL`  | your Turso database URL (`libsql://…`)        | Production, Preview | **Required on Vercel.** The app refuses to boot without it.            |
| `TURSO_AUTH_TOKEN`    | your Turso auth token                         | Production, Preview | Required to connect to a remote Turso database.                        |
| `AUTH_SECRET`         | a long random string                          | Production, Preview | The JWT signing secret (min 32 chars).                                 |
| `ADMIN_PASSWORD`      | any long string you pick                      | Production, Preview | Unlocks `/admin`. Never commit the real value to git.                  |
| `GIPHY_API_KEY`       | *(optional)* your Giphy API key               | Production, Preview | For GIF search in the editor. Falls back to a public beta key when unset. |
| `RESEND_API_KEY`      | *(optional)* your Resend API key              | Production, Preview | Enables email-based recovery flows. Without it those flows are disabled. |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` come from your Turso dashboard:
> https://turso.tech/app → select your database → copy the database URL, and
> click **Create Token** to get the auth token.

## 2. Set up a Turso database

1. Create a free database at [turso.tech](https://turso.tech).
2. On the database page, copy the **database URL** (a `libsql://…` string).
3. Create an **auth token** and copy it.
4. Add both as `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in Vercel's
   environment variables (step 1). Tick **Production** and **Preview**.

No migrations to run — the schema is created automatically on first request,
and seed data is bootstrapped on a fresh database.

## 3. Deploy

1. Push this repo to GitHub and import it on [Vercel](https://vercel.com).
2. Confirm the env vars above are set (Vercel only exposes variables that
   exist on the project when a deployment starts).
3. Deploy. On the first request the app creates its tables and seed data.
   Done.

## 4. Confirm everything works

Open the home page of your deployment. You should see:

- The unified editor canvas (type or paste to start).
- "Create a free account" below the editor.

Test the admin panel:

1. Visit `https://YOUR-DOMAIN/admin/login` — you should get a password
   prompt (NOT a 404 or a "not configured" error).
2. Type the `ADMIN_PASSWORD` you set. Click **Sign in**.
3. You land on `/admin` with stats and quick-link cards.
4. Go to **Tags** → create a tag with a color and optional effect.
5. Go to **Users** → click a user → assign a tag.
6. Open that user's public profile — the tag should appear.

## 5. Keeping the database warm (optional)

Turso databases are always-on, so there is no "sleep" cold start to work
around. `vercel.json` does **not** configure a cron in this repo. If you want
a keep-alive health check anyway, point an external uptime monitor at:

```
https://YOUR-DOMAIN/api/ping
```

It runs a trivial `SELECT 1` against the database and returns JSON. This is
purely optional — it is not required for correctness.

## 6. Local development

```bash
npm install
npm run dev
# open http://localhost:3000
```

With no `TURSO_DATABASE_URL` set, the app uses a local SQLite file
(`local.db`) — zero configuration. A demo account is seeded on first run:

| Username | Password   |
| -------- | ---------- |
| `demo`   | `demo1234` |

To develop against a real Turso database instead:

```bash
TURSO_DATABASE_URL="libsql://your-db.turso.io" \
TURSO_AUTH_TOKEN="your-token" \
npm run dev
```

## 7. Troubleshooting

| Symptom                                                        | Fix                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `TURSO_DATABASE_URL is required on Vercel`                     | The env var wasn't saved or you forgot to redeploy. Add it and redeploy.        |
| `/admin/login` says "ADMIN_PASSWORD is not set on the server." | Save the `ADMIN_PASSWORD` env var and redeploy.                                 |
| 3rd account from your IP gets "You can only create 3 accounts…"| Working as designed. Use a different network/VPN to test.                      |
| Tag you assigned doesn't show on a profile                     | Hard refresh (Ctrl+Shift+R). The page is `dynamic = 'force-dynamic'`.           |
| `no such table: users`                                         | Schema is created automatically on first connection; check build/runtime logs.  |
