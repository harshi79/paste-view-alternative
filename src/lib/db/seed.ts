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
