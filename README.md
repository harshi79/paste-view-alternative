# ⚡ VibeBin — a free PasteView alternative

**Paste it. Share it. Flex it.** VibeBin is a fully free alternative to
[pasteview.com](https://pasteview.com) — a pastebin with all the "premium" profile
customization unlocked for everyone: profile pictures, background image/**video**
banners, animated name effects (typewriter, neon, shimmer, rainbow), custom colored
links, badges, expiring pastes, password-protected pastes and more.

No paywalls. No ads. Guests can paste without an account.

## ✨ Features

### Pastes
- 📝 Create pastes as a **guest** (no account needed) or as a member
- 🌈 **Syntax highlighting** for 19 languages, with line numbers
- ⏳ **Expiration**: 10 min → 1 month (auto-purged)
- 🔒 **Password protection** (content is never sent until unlocked)
- 🕶 **Public / unlisted** visibility
- 📌 **Pin** pastes to the top of your profile
- 👁 View counts, raw view, download, copy button
- 🎨 Custom **title colors**

### Profiles (the fun part — 100% free)
- 🖼 **Avatar**: upload (auto-resized in your browser) or image URL
- 🎬 **Banner**: background **image or looping video** (mp4 URL), or upload an image
- ✍️ **Animated name effects**: typewriter, neon glow, shimmer, rainbow, gradient/solid colors
- 🔗 Up to **6 custom colored links**
- 🏅 **Auto badges** (OG member, Prolific, Viral, Certified Stylist…)
- 👁 Profile view counter, about-me toggle, accent colors
- 🎛 **Live-preview profile studio** at `/settings`

### Platform
- 🔐 Username/password auth (bcrypt-hashed, JWT session cookies)
- 🗄 **Neon Postgres** in production — schema is created automatically, no migrations
- 🧪 **Zero-config dev mode**: with no `DATABASE_URL`, it runs on an embedded
  Postgres (PGlite) stored in `.pglite-data/`
- ▲ **Deploy free on Vercel**

## 🚀 Quick start (local)

```bash
npm install
npm run dev          # → http://localhost:3000
```

That's it — no database setup needed. A demo account is seeded on first run:

| Username | Password   |
| -------- | ---------- |
| `demo`   | `demo1234` |

## 🚀 Deploy to Vercel + Neon (free)

1. Create a free database at [neon.tech](https://neon.tech) and copy the
   **pooled** connection string.
2. Push this repo to GitHub and import it on [Vercel](https://vercel.com).
3. Add environment variables in Vercel → Settings → Environment Variables:

   | Variable       | Value                                  |
   | -------------- | -------------------------------------- |
   | `DATABASE_URL` | your Neon pooled connection string     |
   | `AUTH_SECRET`  | any long random string (required)      |

   Generate a secret with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
4. Deploy. Tables are created automatically on first request. Done ✅

## 🧱 Tech stack

- **Next.js 15** (App Router, React 19, TypeScript) — Vercel-ready
- **Tailwind CSS 4**
- **Drizzle ORM** over `postgres` (Neon) or **PGlite** (embedded dev fallback)
- **highlight.js**, **jose** (JWT), **bcryptjs**, **nanoid**

## 🗺 Project layout

```
src/
  app/
    page.tsx              home + paste composer + recent pastes
    p/[id]/               paste view (password gate, expiry, owner actions)
    p/[id]/raw/           raw text / download
    u/[username]/         public profile (banner, effects, badges, pastes)
    dashboard/            my pastes (stats, pin, delete)
    settings/             profile studio (live preview)
    api/                  auth, pastes, profile endpoints
  components/             UI components (editor, viewer, name effects…)
  lib/
    db/                   schema, driver switch (Neon ⇄ PGlite), seed
    auth.ts               sessions (jose JWT cookies) + bcrypt
    pastes.ts             expiry logic, id generation
middleware.ts             edge guard for signed-in pages
```

## 📄 License

See [LICENSE](./LICENSE).
