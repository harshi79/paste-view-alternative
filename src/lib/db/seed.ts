import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { users, profiles, pastes, tags, stickers } from './schema';
import type { DB } from './index';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const DEMO_PASSWORD = 'demo1234';
const NOVA_PASSWORD = 'novapass1';

const SEED_TAGS = [
  { label: 'Founder', color: '#fbbf24', effect: 'gold' },
  { label: 'Verified', color: '#22d3ee', effect: 'neon' },
  { label: 'OG', color: '#a78bfa', effect: 'shimmer' },
  { label: 'Bug Hunter', color: '#f87171', effect: 'fire' },
  { label: 'Top 100', color: '#4ade80', effect: 'rainbow' },
];

// Token, url-or-emoji, label. We use a tiny inline SVG data URL for
// the sample stickers so the seed is self-contained. The admin can
// later replace these URLs with real animated stickers.
function pngStickerUrl(label: string, bg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${bg}"/><text x="32" y="40" text-anchor="middle" font-size="28" font-family="system-ui">${label}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const SEED_STICKERS = [
  { token: ':wave:', url: pngStickerUrl('👋', '#a78bfa'), emoji: '👋', label: 'Wave' },
  { token: ':fire:', url: pngStickerUrl('🔥', '#f97316'), emoji: '🔥', label: 'Fire' },
  { token: ':rocket:', url: pngStickerUrl('🚀', '#22d3ee'), emoji: '🚀', label: 'Rocket' },
  { token: ':sparkles:', url: pngStickerUrl('✨', '#facc15'), emoji: '✨', label: 'Sparkles' },
  { token: ':100:', url: pngStickerUrl('💯', '#ef4444'), emoji: '💯', label: '100' },
  { token: ':ok:', url: pngStickerUrl('👌', '#4ade80'), emoji: '👌', label: 'OK' },
  { token: ':tada:', url: pngStickerUrl('🎉', '#f472b6'), emoji: '🎉', label: 'Tada' },
  { token: ':bug:', url: pngStickerUrl('🐛', '#84cc16'), emoji: '🐛', label: 'Bug' },
  { token: ':heart:', url: pngStickerUrl('❤️', '#f87171'), emoji: '❤️', label: 'Heart' },

  // Default anime GIF pack — free reaction GIFs from the keyless
  // NekosBest API (https://nekos.best, CORS-enabled, no API key).
  // URLs are stable per-file assets; emoji is the offline fallback.
  { token: ':hug:', url: 'https://nekos.best/api/v2/hug/350aee04-6ec3-40a9-b45e-15c754b9c25d.gif', emoji: '🤗', label: 'Anime hug' },
  { token: ':kiss:', url: 'https://nekos.best/api/v2/kiss/5a0e8e01-8992-4b7a-91ed-2bbf3ac7e5b9.gif', emoji: '😘', label: 'Anime kiss' },
  { token: ':pat:', url: 'https://nekos.best/api/v2/pat/e704d636-0ed6-4559-92ec-61568fd10ef6.gif', emoji: '🖐️', label: 'Anime pat' },
  { token: ':blush:', url: 'https://nekos.best/api/v2/blush/50b11542-3d86-4368-af3c-1aa060cfcb72.gif', emoji: '😊', label: 'Anime blush' },
  { token: ':cry:', url: 'https://nekos.best/api/v2/cry/eea3fe7e-0846-4e60-afc0-7e1a787eb556.gif', emoji: '😢', label: 'Anime cry' },
  { token: ':wink:', url: 'https://nekos.best/api/v2/wink/75a33d9e-18a6-4777-8b0f-26231a8a6cfe.gif', emoji: '😉', label: 'Anime wink' },
  { token: ':happy:', url: 'https://nekos.best/api/v2/happy/1158fd04-ee35-4897-afbd-ca397ecc6c3c.gif', emoji: '😄', label: 'Anime happy' },
  { token: ':dance:', url: 'https://nekos.best/api/v2/dance/52b1e250-a89c-4c65-93ac-d490d54c700a.gif', emoji: '💃', label: 'Anime dance' },
  { token: ':cuddle:', url: 'https://nekos.best/api/v2/cuddle/84b24863-5b47-495c-a9ee-8226655553c5.gif', emoji: '🥰', label: 'Anime cuddle' },
  { token: ':anime-wave:', url: 'https://nekos.best/api/v2/wave/3c855905-a12a-4bd1-8938-57067b791b0e.gif', emoji: '👋', label: 'Anime wave' },
];

export async function seedIfEmpty(db: DB) {
  const rows = await db.select({ n: sql<number>`count(*)` }).from(users);
  if (Number(rows[0]?.n ?? 0) > 0) {
    // Even if users exist, make sure the default tags/stickers are
    // present (idempotent on a fresh deploy with no seed data).
    await ensureStickersAndTags(db);
    return;
  }

  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const novaHash = bcrypt.hashSync(NOVA_PASSWORD, 10);

  const [demo] = await db
    .insert(users)
    .values({ username: 'demo', passwordHash: hash })
    .returning();
  const [nova] = await db
    .insert(users)
    .values({ username: 'nova', passwordHash: novaHash })
    .returning();

  await db.insert(profiles).values([
    {
      userId: demo.id,
      displayName: 'Demo User',
      bio: 'Just exploring the app. Try the rich-text editor and the new name effects.',
      avatarUrl: '/demo/avatar.jpg',
      bannerUrl: '/demo/banner.jpg',
      bannerType: 'image',
      nameFrom: '#a78bfa',
      nameTo: '#f472b6',
      nameStyle: 'gradient',
      nameEffect: 'shimmer',
      accent: '#8b5cf6',
      links: [
        { label: 'Website', url: 'https://example.com', color: '#8b5cf6' },
        { label: 'GitHub', url: 'https://github.com', color: '#22d3ee' },
      ],
    },
    {
      userId: nova.id,
      displayName: 'Nova',
      bio: 'Neon and clean code.',
      avatarUrl: null,
      bannerUrl: null,
      bannerType: 'image',
      nameFrom: '#22d3ee',
      nameTo: '#4ade80',
      nameStyle: 'gradient',
      nameEffect: 'neon',
      accent: '#22d3ee',
      links: [{ label: 'Discord', url: 'https://discord.com', color: '#f472b6' }],
    },
  ]);

  const now = Date.now();
  await db.insert(pastes).values([
    {
      id: 'welcometovb',
      userId: demo.id,
      title: 'Welcome',
      titleColor: '#a78bfa',
      format: 'plain',
      content: `Welcome to VibeBin — a free PasteView alternative.

* Paste code or text and get a shareable link instantly
* No account needed (guests welcome)
* Create a free account to unlock profile customization:
  - profile picture + background image or video banner
  - animated name effects (typewriter, neon, shimmer, rainbow, fire, glitch, wave, aurora, gold)
  - custom links, accent colors, badges and more

Sign in with the demo account to try it:
    username: demo
    password: ${DEMO_PASSWORD}`,
      language: 'markdown',
      visibility: 'public',
      pinned: true,
      views: 1337,
      createdAt: new Date(now - 40 * HOUR),
    },
    {
      id: 'fizzbuzzdemo',
      userId: demo.id,
      title: 'FizzBuzz',
      content: `function fizzbuzz(n) {
  for (let i = 1; i <= n; i++) {
    const out = (i % 3 ? '' : 'Fizz') + (i % 5 ? '' : 'Buzz');
    console.log(out || i);
  }
}

fizzbuzz(100);`,
      language: 'javascript',
      visibility: 'public',
      views: 214,
      createdAt: new Date(now - 26 * HOUR),
    },
    {
      id: 'py-oneliner',
      userId: nova.id,
      title: 'Python one-liner',
      content: `# Reverse every word but keep the order
sentence = "hello world from vibebin"
print(' '.join(w[::-1] for w in sentence.split()))`,
      language: 'python',
      visibility: 'public',
      views: 87,
      createdAt: new Date(now - 8 * HOUR),
    },
    {
      id: 'tailwindtip',
      userId: nova.id,
      title: 'Glass card snippet',
      content: `<!-- Frosted glass card -->
<div class="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl
            shadow-2xl shadow-black/40 p-6">
  <h2 class="bg-gradient-to-r from-violet-400 to-cyan-300 bg-clip-text
             text-transparent text-xl font-bold">Glassy</h2>
</div>`,
      language: 'html',
      visibility: 'public',
      views: 42,
      createdAt: new Date(now - 2 * HOUR),
    },
  ]);

  // Tags + stickers
  for (const t of SEED_TAGS) {
    await db.insert(tags).values(t).onConflictDoNothing();
  }
  for (const s of SEED_STICKERS) {
    await db.insert(stickers).values(s).onConflictDoNothing();
  }

  console.log('[vibebin] seeded demo data (demo/demo1234)');
}

async function ensureStickersAndTags(db: DB) {
  for (const t of SEED_TAGS) {
    await db.insert(tags).values(t).onConflictDoNothing();
  }
  for (const s of SEED_STICKERS) {
    await db.insert(stickers).values(s).onConflictDoNothing();
  }
}
