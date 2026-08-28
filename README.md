# ⚡ VibeBin

A free PasteView alternative: share pastes with syntax highlighting, expiring links, password
protection and rich-text formatting. Profile customization (animated names, video banners,
custom colors and links, badges) is free for everyone.

## Features

### Pastes
- Create pastes as a **guest** (no account needed) or as a member
- **Plain text** or **rich text** editor: per-line font, size and color, plus inline emoji and
  custom stickers
- Auto-detects every URL / email / phone number in a paste and makes it clickable — no link
  previews are ever generated
- **Syntax highlighting** for 19 languages, with line numbers
- **Expiration**: 10 min → 1 month (auto-purged)
- **Password protection** (content is only fetched after unlock)
- **Public / unlisted** visibility
- **Pin** pastes to the top of your profile
- Copy / Raw / Download buttons
- Custom **title colors**

### Profiles
- **URL-only media**: avatar and banner must be remote URLs (image or `.mp4` video). No uploads
  to the database — your storage is yours
- **Animated name effects**: typewriter, shimmer, neon, rainbow, fire, glitch, wave, aurora, gold
- Per-effect **speed** and **intensity** controls
- One-click **effect templates** (Cool, Warm, Neon, Rainbow, Gold, Aurora, Glitch, Wave)
- Up to 6 colored custom links + accent color
- **Auto badges** (OG member, Prolific, Viral, Certified Stylist…)
- Profile view counter, about-me toggle
- Live preview while editing
- **Tags awarded by the admin** show on your profile

### Account
- Username is locked after 24 hours (one rename allowed within that window)
- Per-IP signup limit: **3 accounts per IP**
- Separate **Account & rename** page (`/account`) with logout

### Admin
- Hidden at `/admin`, gated by the `ADMIN_PASSWORD` env var (not committed to git)
- Award custom **tags** to any user (label, color, optional effect)
- Curate the **sticker pack** the rich editor exposes
- Tag library has full CRUD with rainbow / neon / fire / gold effects

## Quick start (local)

```bash
npm install
npm run dev          # → http://localhost:3000
```

No database setup needed. A demo account is seeded on first run:

| Username | Password   |
| -------- | ---------- |
| `demo`   | `demo1234` |

## Deploy to Vercel + Neon (free)

1. Create a free database at [neon.tech](https://neon.tech) and copy the **pooled** connection
   string.
2. Push this repo to GitHub and import it on [Vercel](https://vercel.com).
3. Add these environment variables in Vercel → Settings → Environment Variables:

   | Variable         | Value                                                                 |
   | ---------------- | --------------------------------------------------------------------- |
   | `DATABASE_URL`   | your Neon pooled connection string                                    |
   | `AUTH_SECRET`    | any long random string (required)                                     |
   | `ADMIN_PASSWORD` | the password for the `/admin` panel (long, keep it secret)            |

   Generate a secret with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
4. Deploy. Tables are created automatically on first request. Done.

The `ADMIN_PASSWORD` value is **never** committed to git — `.env.example` is the only file that
mentions its name, and Vercel injects the real value at runtime.

## Project layout

```
src/
  app/
    page.tsx              home + paste composer
    p/[id]/               paste view (password gate, expiry, owner actions)
    p/[id]/raw/           raw text / download
    u/[username]/         public profile (banner, effects, badges, tags, pastes)
    dashboard/            my pastes (stats, pin, delete, share link)
    settings/             profile studio (tabbed: profile / name / links)
    account/              rename + logout
    admin/                admin panel (overview, users, tags, stickers)
    admin/login/          password gate
    api/                  auth, pastes, profile, admin, stickers endpoints
  components/             UI components (editor, viewer, name effects, admin…)
  lib/
    auth.ts               sessions (jose JWT cookies) + admin auth + rename policy
    db/                   schema, driver switch (Neon ⇄ PGlite), seed
    pasteFormat.ts        rich-text format + link detection
    ip.ts                 client IP resolver
    pastes.ts             expiry, id generation
middleware.ts             edge guard for /dashboard /settings /account /admin
```

## Tech stack

- **Next.js 15** (App Router, React 19, TypeScript) — Vercel-ready
- **Tailwind CSS 4**
- **Drizzle ORM** over `postgres` (Neon) or **PGlite** (embedded dev fallback)
- **highlight.js**, **jose** (JWT), **bcryptjs**, **nanoid**

## License

See [LICENSE](./LICENSE).
