import Link from 'next/link';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { purgeExpiredIfDue } from '@/lib/pastes';
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
          in one place, no account needed.
        </p>
      </section>

      <section className="mx-auto max-w-5xl">
        <Editor username={session?.user.username ?? null} />
      </section>

      <section className="mt-12 border-t border-white/[0.06] pt-8 sm:mt-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex items-start gap-3">
              <span className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-sm">
                {f.icon}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-white">{f.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{f.text}</p>
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
