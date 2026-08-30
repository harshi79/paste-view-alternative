import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { users, profiles, pastes, tags, stickers, appMeta } from './schema';
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

  // Anime reaction GIFs are provided live from the Nekos.best API via the
  // editor's "Anime GIFs" tab (see src/lib/neko.ts) and stored on the rich
  // line as explicit urls. The DB pack keeps the same tokens as emoji-only
  // fallbacks so pastes never show a broken image when the API is down.
  { token: ':anime-hug:', url: null, emoji: '🤗', label: 'Anime hug' },
  { token: ':anime-kiss:', url: null, emoji: '😘', label: 'Anime kiss' },
  { token: ':anime-pat:', url: null, emoji: '🖐️', label: 'Anime pat' },
  { token: ':anime-blush:', url: null, emoji: '😊', label: 'Anime blush' },
  { token: ':anime-cry:', url: null, emoji: '😢', label: 'Anime cry' },
  { token: ':anime-wink:', url: null, emoji: '😉', label: 'Anime wink' },
  { token: ':anime-happy:', url: null, emoji: '😄', label: 'Anime happy' },
  { token: ':anime-dance:', url: null, emoji: '💃', label: 'Anime dance' },
  { token: ':anime-cuddle:', url: null, emoji: '🥰', label: 'Anime cuddle' },
  { token: ':anime-wave:', url: null, emoji: '👋', label: 'Anime wave' },
];

// ------------------------------------------------------------------
// Initialization marker
// ------------------------------------------------------------------
// Once the database has been initialized (its first-install seed data was
// applied on a previous boot), we must NEVER re-seed. Re-seeding on every
// boot is exactly what used to resurrect admin-deleted seed stickers/tags:
// every seed row was (re)inserted with a fresh random UUID and only the
// unique token/label guarded against duplicates — a deleted row no longer
// conflicts, so it came back. The marker makes initialization happen
// exactly once; after that, a restart is a no-op for seeding.
const SEED_MARKER_KEY = 'seed:initialized';
const SEED_MARKER_VALUE = '1';

async function isInitialized(db: DB): Promise<boolean> {
  const rows = await db
    .select({ value: appMeta.value })
    .from(appMeta)
    .where(eq(appMeta.key, SEED_MARKER_KEY))
    .limit(1);
  return rows.length > 0 && rows[0].value === SEED_MARKER_VALUE;
}

async function markInitialized(db: DB): Promise<void> {
  await db
    .insert(appMeta)
    .values({ key: SEED_MARKER_KEY, value: SEED_MARKER_VALUE })
    .onConflictDoUpdate({ target: appMeta.key, set: { value: SEED_MARKER_VALUE } });
}

export async function seedIfEmpty(db: DB) {
  // If this database was already initialized on a previous boot, do not
  // re-seed. This is the core of the fix: an admin's deletion of a seeded
  // sticker/tag is now permanent across restarts.
  if (await isInitialized(db)) {
    return;
  }

  const rows = await db.select({ n: sql<number>`count(*)` }).from(users);
  if (Number(rows[0]?.n ?? 0) > 0) {
    // Pre-existing deployment (predates the initialization marker): bring
    // the default tags/stickers up to date ONCE, then mark as initialized
    // so a later boot never resurrects a deliberately deleted seed row.
    await ensureStickersAndTags(db);
    await markInitialized(db);
    return;
  }

  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const novaHash = bcrypt.hashSync(NOVA_PASSWORD, 10);

  const now = Date.now();

  const [demo] = await db
    .insert(users)
    .values({ id: randomUUID(), username: 'demo', passwordHash: hash, createdAt: new Date(now) })
    .returning();
  const [nova] = await db
    .insert(users)
    .values({ id: randomUUID(), username: 'nova', passwordHash: novaHash, createdAt: new Date(now) })
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
    await db.insert(tags).values({ id: randomUUID(), ...t, createdAt: new Date(now) }).onConflictDoNothing();
  }
  for (const s of SEED_STICKERS) {
    await db.insert(stickers).values({ id: randomUUID(), ...s, createdAt: new Date(now) }).onConflictDoNothing();
  }

  await markInitialized(db);
  console.log('[vibebin] seeded demo data (demo/demo1234)');
}

async function ensureStickersAndTags(db: DB) {
  const now = Date.now();
  for (const t of SEED_TAGS) {
    await db.insert(tags).values({ id: randomUUID(), ...t, createdAt: new Date(now) }).onConflictDoNothing();
  }
  for (const s of SEED_STICKERS) {
    await db.insert(stickers).values({ id: randomUUID(), ...s, createdAt: new Date(now) }).onConflictDoNothing();
  }
}
