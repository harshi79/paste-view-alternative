import Link from 'next/link';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { purgeExpiredIfDue } from '@/lib/pastes';
import Editor from '@/components/Editor';

export const dynamic = 'force-dynamic';

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
    title: 'Instant pastes',
    text: 'Share code or text with a clean link in seconds. No account required.',
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="10" cy="7.4" r="1.3" fill="currentColor" />
        <path d="M6.9 13.4c.9-.8 2-1.2 3.1-1.2s2.2.4 3.1 1.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: 'Custom profiles',
    text: 'Animated name effects, banners, video loops and colored links for your public page.',
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <rect x="3.5" y="8.5" width="13" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6.5 8.5V6a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    title: 'Paste controls',
    text: 'Passwords, expiring links, unlisted pastes, view counts and pinning.',
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <path d="M4 6.5h9M13 6.5h.4M4 10h4.5M11 10h5M4 13.5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: 'Rich text',
    text: 'Per-line fonts, sizes and colors, with inline emoji and auto-linked URLs.',
  },
];

const QUICK_NOTES = [
  'One unified editor',
  'Password-protected or public',
  'Plain text, code, and rich formatting',
];

export default async function HomePage() {
  const db = await getDb();
  const [session] = await Promise.all([getSessionUser(), purgeExpiredIfDue(db)]);

  return (
    <div className="animate-fade-up pb-2 pt-3 sm:pt-6">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_360px] lg:items-start">
        <div>
          <p className="eyebrow">New paste</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-[3.4rem] lg:leading-[1.05]">
            A polished paste workflow for code, notes, and rich snippets.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-zinc-400 sm:text-lg">
            VibeBin keeps the existing fast paste flow, then upgrades the experience with a cleaner
            workspace, polished controls, and one unified editor for normal and rich content.
          </p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            {QUICK_NOTES.map((note) => (
              <span key={note} className="pill">
                {note}
              </span>
            ))}
          </div>
        </div>

        <aside className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          <div className="stat-card p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-300">
              Paste experience
            </p>
            <p className="mt-3 text-lg font-semibold text-white">Focused, not cluttered</p>
            <p className="mt-1.5 text-sm leading-6 text-zinc-400">
              Metadata stays close at hand, while the editor remains the visual centerpiece.
            </p>
          </div>
          <div className="stat-card p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
              Unified editor
            </p>
            <p className="mt-3 text-lg font-semibold text-white">Plain + rich together</p>
            <p className="mt-1.5 text-sm leading-6 text-zinc-400">
              Start typing plain text, then layer formatting, stickers, GIFs, and colors only where
              you need them.
            </p>
          </div>
          <div className="stat-card p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              Sharing controls
            </p>
            <p className="mt-3 text-lg font-semibold text-white">Safe defaults, fast sharing</p>
            <p className="mt-1.5 text-sm leading-6 text-zinc-400">
              Visibility, expiration, passwords, and title color all stay intact without changing
              the underlying paste behavior.
            </p>
          </div>
        </aside>
      </section>

      <section className="mt-8 lg:mt-10">
        <Editor username={session?.user.username ?? null} />
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="card px-5 py-4 sm:px-6">
          <p className="text-sm text-zinc-400">
            Guest-friendly by default. Sign up only if you want saved paste history and a public
            profile with custom branding.
          </p>
        </div>
        {!session && (
          <Link href="/register" className="btn-primary justify-center sm:justify-self-start">
            Create a free account
          </Link>
        )}
      </section>

      <section className="mt-12 border-t border-white/[0.06] pt-8 sm:mt-16">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Why VibeBin</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">Everything already here, just cleaner.</h2>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="card flex items-start gap-4 rounded-[24px] p-5">
              <span className="mt-0.5 grid h-11 w-11 flex-none place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-brand-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                {f.icon}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{f.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
