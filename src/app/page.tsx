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

export default async function HomePage() {
  const db = await getDb();
  // Session + throttled lazy expiry purge are independent — run them together.
  const [session] = await Promise.all([getSessionUser(), purgeExpiredIfDue(db)]);

  return (
    <div className="animate-fade-up pt-8 sm:pt-12">
      {/* Compact page intro — the workspace below is the focus. */}
      <section className="mb-5 sm:mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-400">
          New paste
        </p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Paste code, text, or rich content.
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-[15px]">
          Syntax highlighting, expiring links, passwords, unlisted pastes and rich formatting — all
          in one workspace, with no account required.
        </p>
      </section>

      <section className="mx-auto max-w-5xl">
        <Editor username={session?.user.username ?? null} />
      </section>

      <section className="mt-12 border-t border-white/[0.06] pt-8 sm:mt-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass flex items-start gap-3 rounded-2xl p-4">
              <span className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-brand-300">
                {f.icon}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-white">{f.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-400">{f.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 text-center text-sm text-zinc-500">
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
