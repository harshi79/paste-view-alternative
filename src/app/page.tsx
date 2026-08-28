import Link from 'next/link';
import { desc, eq, isNull, or, gt, and } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { pastes, users, profiles } from '@/lib/db/schema';
import { getSessionUser } from '@/lib/auth';
import { purgeExpired } from '@/lib/pastes';
import Editor from '@/components/Editor';
import PasteCard from '@/components/PasteCard';

export const dynamic = 'force-dynamic';

const FEATURES = [
  {
    icon: '⚡',
    title: 'Instant pastes',
    text: 'Share code or text with a clean link in seconds — no account required.',
  },
  {
    icon: '🎨',
    title: 'Profiles that flex',
    text: 'Video banners, avatars, animated name effects, custom links — all free.',
  },
  {
    icon: '🔒',
    title: 'Real paste controls',
    text: 'Passwords, expiring links, unlisted pastes, view counts and pinning.',
  },
  {
    icon: '💸',
    title: 'Everything free',
    text: "PasteView's premium perks, minus the paywall. Forever.",
  },
];

export default async function HomePage() {
  const session = await getSessionUser();
  const db = await getDb();
  await purgeExpired(db);

  const recent = await db
    .select({
      id: pastes.id,
      title: pastes.title,
      titleColor: pastes.titleColor,
      language: pastes.language,
      views: pastes.views,
      createdAt: pastes.createdAt,
      username: users.username,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
    })
    .from(pastes)
    .leftJoin(users, eq(pastes.userId, users.id))
    .leftJoin(profiles, eq(users.id, profiles.userId))
    .where(
      and(
        eq(pastes.visibility, 'public'),
        or(isNull(pastes.expiresAt), gt(pastes.expiresAt, new Date())),
      ),
    )
    .orderBy(desc(pastes.createdAt))
    .limit(9);

  return (
    <div className="pt-10 sm:pt-14">
      {/* Hero */}
      <section className="animate-fade-up mb-10 text-center sm:mb-14">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold text-brand-200">
          ✦ 100% free PasteView alternative
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">
          Paste it. Share it.{' '}
          <span className="effect-gradient-text" style={{ '--name-from': '#a78bfa', '--name-to': '#22d3ee' } as React.CSSProperties}>
            Flex it.
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-balance text-base text-zinc-400 sm:text-lg">
          Share code and text with syntax highlighting, expiring links & passwords — then customize
          your profile with animated names, video banners and more. All free, no paywalls.
        </p>
      </section>

      {/* Editor */}
      <section className="mx-auto max-w-3xl">
        <Editor username={session?.user.username ?? null} />
      </section>

      {/* Features */}
      <section className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            className="animate-fade-up rounded-2xl border border-white/10 bg-night-800/50 p-5 backdrop-blur"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="mb-2 text-2xl">{f.icon}</div>
            <h3 className="font-bold text-white">{f.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">{f.text}</p>
          </div>
        ))}
      </section>

      {/* Recent pastes */}
      <section className="mt-16">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-2xl font-extrabold tracking-tight text-white">Fresh pastes</h2>
          <Link href="/register" className="text-sm font-semibold text-brand-300 hover:text-brand-200">
            Create a profile →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-zinc-500">
            No public pastes yet — be the first! ✨
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((p) => (
              <PasteCard
                key={p.id}
                paste={{
                  id: p.id,
                  title: p.title,
                  titleColor: p.titleColor,
                  language: p.language,
                  views: p.views,
                  createdAt: p.createdAt,
                  author: p.username
                    ? { username: p.username, displayName: p.displayName, avatarUrl: p.avatarUrl }
                    : null,
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
