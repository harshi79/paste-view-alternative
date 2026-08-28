import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { users, profiles, pastes } from './schema';
import type { DB } from './index';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const DEMO_PASSWORD = 'demo1234';

export async function seedIfEmpty(db: DB) {
  const rows = await db.select({ n: sql<number>`count(*)` }).from(users);
  if (Number(rows[0]?.n ?? 0) > 0) return;

  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const novaHash = bcrypt.hashSync('novapass1', 10);

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
      bio: 'Just exploring VibeBin — click "Customize profile" vibes.\nTry uploading an avatar, a banner and a name effect!',
      avatarUrl: '/demo/avatar.jpg',
      bannerUrl: '/demo/banner.jpg',
      bannerType: 'image',
      nameFrom: '#a78bfa',
      nameTo: '#f472b6',
      nameStyle: 'gradient',
      nameEffect: 'typewriter',
      accent: '#8b5cf6',
      links: [
        { label: 'Website', url: 'https://example.com', color: '#8b5cf6' },
        { label: 'GitHub', url: 'https://github.com', color: '#22d3ee' },
      ],
    },
    {
      userId: nova.id,
      displayName: 'Nova',
      bio: 'Neon dreams & clean code.',
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
      title: 'Welcome to VibeBin ✨',
      titleColor: '#a78bfa',
      content: `Welcome to VibeBin — a free, open PasteView alternative.

* Paste code or text and get a shareable link instantly
* No account needed (guests welcome!)
* Create a free account to unlock profile customization:
    - profile picture + background image or VIDEO banner
    - animated name effects (typewriter, neon, shimmer, rainbow)
    - custom links, accent colors, badges and more

Sign up with the demo account to try it:
    username: demo
    password: ${DEMO_PASSWORD}

Paste it. Share it. Flex it.`,
      language: 'markdown',
      visibility: 'public',
      pinned: true,
      views: 1337,
      createdAt: new Date(now - 40 * HOUR),
    },
    {
      id: 'fizzbuzzdemo',
      userId: demo.id,
      title: 'FizzBuzz, but make it clean',
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
      title: 'Python one-liner I keep forgetting',
      content: `# Reverse every word but keep the order
sentence = "hello world from vibebin"
print(' '.join(w[::-1] for w in sentence.split()))
# -> "olleh dlrow morf nibebiv"`,
      language: 'python',
      visibility: 'public',
      views: 87,
      createdAt: new Date(now - 8 * HOUR),
    },
    {
      id: 'tailwindtip',
      userId: nova.id,
      title: 'Glass card snippet (Tailwind v4)',
      content: `<!-- Frosted glass card that works on any background -->
<div class="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl
            shadow-2xl shadow-black/40 p-6">
  <h2 class="bg-gradient-to-r from-violet-400 to-cyan-300 bg-clip-text
             text-transparent text-xl font-bold">Glassy ✨</h2>
</div>`,
      language: 'html',
      visibility: 'public',
      views: 42,
      createdAt: new Date(now - 2 * HOUR),
    },
  ]);

  console.log('[vibebin] seeded demo data (demo/demo1234)');
}
