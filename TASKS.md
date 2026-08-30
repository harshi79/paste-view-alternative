# VibeBin v2 — Task List

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

## A. Paste viewer / composer
- [x] A1. Rich-text paste content: font family + size + color in the editor
- [x] A2. Custom-emoji insertion in pastes (built-in emoji + sticker pack the admin curates)
- [x] A3. Auto-detect ALL link types (http/https/www/email/tel) in paste content → clickable <a target=_blank>
- [x] A4. NO link previews anywhere (no unfurl, no og:image cards, no embeds)
- [x] A5. After creating a paste:
  - Signed-in user → /dashboard?created=<id> (new row highlighted, "Copy link" button)
  - Guest → /p/<id> with a "Copy link" button
  - The share URL is never rendered as plain text in the editor flow.
- [x] A6. Removed "Recent pastes" section from the home page
- [x] A7. Paste view page has Copy link / Copy content / Raw / Download buttons

## B. Profiles & navigation cleanup
- [x] B1. Clicking the avatar/username opens a dropdown: View profile, Edit profile, My pastes, Account & rename, Log out
- [x] B2. /settings uses tabs: Profile & media / Name & effects / Links
- [x] B3. Username rename lock (one-time within 24h of registration)
- [x] B4. Username uniqueness enforced case-insensitively
- [x] B5. Avatar / banner / video banner accept ONLY URL inputs (no uploads)
- [x] B6. New name effects: fire, glitch, wave, aurora, gold (plus original typewriter/shimmer/neon/rainbow)
- [x] B7. One-click effect templates (Cool, Warm, Neon, Rainbow, Gold, Aurora, Glitch, Wave)
- [x] B8. Per-effect speed and intensity sliders; per-template colors; link colors; accent

## C. Account limits
- [x] C1. Max 3 accounts per IP. Reads x-forwarded-for (Vercel safe)
- [x] C2. Track IP in a `signup_ips` table
- [x] C3. No DB-stored media (only URLs in DB columns)

## D. Admin panel
- [x] D1. /admin login: asks for ADMIN_PASSWORD (env var, not committed)
- [x] D2. Once unlocked, session cookie scoped to /admin (8h)
- [x] D3. Admin pages: Overview, Users, Tags, Stickers
- [x] D4. Admin can assign/remove tags on any user's profile; tags show on public profile
- [x] D5. Admin tag: label, color, optional effect (rainbow/neon/shimmer/fire/gold)
- [x] D6. ADMIN_PASSWORD documented in .env.example and README (Vercel setup)

## E. UI / copy
- [x] E1. Removed "AI hype" copy ("awesome", "flex it", "elevate", "100% free" removed from headings)
- [x] E2. Clean dropdowns, separate pages, less clutter
- [x] E3. Updated footer copy

## F. Build / deploy
- [x] F1. Build passes (next build clean)
- [x] F2. Pushed to branch (done at end)
- [x] F3. Added Vercel env instructions in README

## V3 — Performance, emoji status, unified editor, stickers, passwords
- [x] V3.1. Server-side syntax highlighting (hljs out of the initial client bundle); lazy-loaded client viewer only after unlocking a protected paste
- [x] V3.2. Shared, cached sticker-pack loader + cache headers on /api/stickers
- [x] V3.3. Expiry purge throttled (at most once per 5 min per process); parallel DB round-trips on home/paste/profile
- [x] V3.4. Emoji status (custom emoji + optional status text) beside name/username, picker + free entry, edit/remove, desktop + mobile
- [x] V3.5. Wave effect crash fix: keyframes moved to globals.css (styled-jsx is not SSR'd in App Router), defensive guards, memoized letters
- [x] V3.6. Unified paste page with a clear Basic/Rich toggle at the top
- [x] V3.7. Sticker/GIF shortcodes (`:wave:` / `;fire;`) auto-convert in rich pastes; animated stickers render in composer preview and result; no shortcode text shown
- [x] V3.8. Password management: forgot-password flow (one-time 30-min reset code, single-use), reset page, change-password in Account (confirms current password), safe error messages for expired/invalid/used links
- [x] V3.9. Unified paste creation: Text/Rich mode toggle removed — one editor, one paste that mixes plain text and rich content (unstyled lines = plain text; font/size/color/stickers layered per line). Legacy 'plain' rows kept 100% compatible (same URLs, same viewer, byte-identical raw); raw/download + unlock flow now render the readable text of rich docs; "Rich" badge reflects actual formatting. No schema change, no migration.
