import Link from 'next/link';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { purgeExpired } from '@/lib/pastes';
import Editor from '@/components/Editor';

export const dynamic = 'force-dynamic';

const FEATURES = [
  {
    icon: '⚡',
    title: 'Instant pastes',
    text: 'Share code or text with a clean link in seconds. No account required.',
  },
  {
    icon: '🎨',
    title: 'Profiles that flex',
    text: 'Animated name effects, custom banners, video loops, colored links — all free.',
  },
  {
    icon: '🔒',
    title: 'Real paste controls',
    text: 'Passwords, expiring links, unlisted pastes, view counts and pinning.',
  },
  {
    icon: '✨',
    title: 'Rich text',
    text: 'Per-line fonts, sizes, colors. Inline emoji and clickable links — no previews.',
  },
];

export default async function HomePage() {
  const db = await getDb();
  // Session + lazy expiry purge are independent — run them together.
  const [session] = await Promise.all([getSessionUser(), purgeExpired(db)]);

  return (
    <div className="pt-10 sm:pt-14">
      <section className="animate-fade-up mb-10 text-center sm:mb-14">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold text-brand-200">
          100% free PasteView alternative
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-black leading-tight tracking-tight sm:text-6xl">
          Paste it. Share it.{' '}
          <span
            className="effect-gradient-text"
            style={{ '--name-from': '#a78bfa', '--name-to': '#22d3ee' } as React.CSSProperties}
          >
            Done.
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-balance text-base text-zinc-400 sm:text-lg">
          Share code and text with syntax highlighting, expiring links, password protection and
          optional rich-text formatting. Profile customization — banners, animated names, links —
          is free for everyone.
        </p>
      </section>

      <section className="mx-auto max-w-3xl">
        <Editor username={session?.user.username ?? null} />
      </section>

      <section className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            className="card animate-fade-up p-5"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="mb-2 text-2xl">{f.icon}</div>
            <h3 className="font-bold text-white">{f.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">{f.text}</p>
          </div>
        ))}
      </section>

      <section className="mt-14 text-center text-sm text-zinc-500">
        <p>
          New here?{' '}
          <Link href="/register" className="font-semibold text-brand-300 hover:text-brand-200">
            Create a free account
          </Link>{' '}
          to unlock profile customization.
        </p>
      </section>
    </div>
  );
}
