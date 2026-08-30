import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import Nav from '@/components/Nav';
import Logo from '@/components/Logo';
import { getSessionUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: {
    default: 'VibeBin — Share pastes and customizable profiles',
    template: '%s · VibeBin',
  },
  description:
    'A fast pastebin for developers. Share code with syntax highlighting, expiring links, password protection, unlisted pastes and rich-text formatting. Custom profiles with animated names, video banners and links.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();

  return (
    <html lang="en">
      <body className="relative font-sans antialiased">
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[520px] w-[760px] -translate-x-1/2 rounded-full bg-brand-600/[0.18] blur-[130px]" />
          <div className="absolute right-0 top-24 h-[360px] w-[420px] rounded-full bg-cyan-500/[0.1] blur-[120px]" />
          <div className="absolute -left-20 top-1/3 h-[320px] w-[320px] rounded-full bg-fuchsia-500/[0.08] blur-[110px]" />
          <div className="absolute bottom-0 left-1/3 h-[360px] w-[460px] rounded-full bg-emerald-500/[0.05] blur-[130px]" />
        </div>

        <Nav
          session={
            session
              ? {
                  username: session.user.username,
                  displayName: session.profile?.displayName ?? null,
                  avatarUrl: session.profile?.avatarUrl ?? null,
                  statusEmoji: session.profile?.statusEmoji ?? null,
                }
              : null
          }
        />

        <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-4 sm:px-6 sm:pt-6">{children}</main>

        <footer className="pb-8 sm:pb-10">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
            <div className="glass rounded-[28px] px-5 py-5 sm:px-6 sm:py-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="eyebrow">Built for developers</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                    <Link href="/" className="transition-opacity hover:opacity-85" aria-label="VibeBin home">
                      <Logo compact />
                    </Link>
                    <span className="hidden h-4 w-px bg-white/10 sm:block" />
                    <span>Share code, notes, and styled snippets with a polished link.</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
                  <span className="pill">Syntax highlighting</span>
                  <span className="pill">Expiring links</span>
                  <span className="pill">Password protection</span>
                  <span className="pill">Rich text</span>
                </div>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
