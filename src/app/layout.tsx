import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import Nav from '@/components/Nav';
import Logo from '@/components/Logo';
import CursorTrail from '@/components/CursorTrail';
import { getSessionUser } from '@/lib/auth';
import { loadStickerByToken } from '@/lib/stickerPack.server';

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
  const statusSticker = session?.profile.statusEmoji
    ? await loadStickerByToken(session.profile.statusEmoji)
    : null;

  return (
    <html lang="en">
      <body className="relative font-sans antialiased">
        <CursorTrail />
        {/* Accent progress bar — the one loud line on the page. */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] bg-gradient-to-r from-brand-500 via-brand-400 to-cyan-400"
        />
        {/* Hard-edged backdrop geometry — flat shapes, no blur. */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-24 top-24 h-72 w-72 rotate-3 border-2 border-white/[0.04]" />
          <div className="absolute -right-28 bottom-24 h-80 w-80 -rotate-2 border-2 border-white/[0.035]" />
          <div className="absolute right-[12%] top-0 h-40 w-[34rem] max-w-full -translate-y-1/2 rotate-[-4deg] bg-brand-600/[0.07]" />
          <div className="absolute -left-16 bottom-1/4 h-32 w-[26rem] max-w-full rotate-[3deg] bg-cyan-500/[0.05]" />
        </div>

        <Nav
          session={
            session
              ? {
                  username: session.user.username,
                  displayName: session.profile?.displayName ?? null,
                  avatarUrl: session.profile?.avatarUrl ?? null,
                  statusEmoji: session.profile?.statusEmoji ?? null,
                  statusSticker,
                }
              : null
          }
        />

        <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">{children}</main>

        <footer className="pb-10 sm:pb-12">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
            <div className="glass rounded-xl px-5 py-5 sm:px-6 sm:py-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="eyebrow">Built for developers</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                    <Link href="/" className="transition-opacity hover:opacity-85" aria-label="VibeBin home">
                      <Logo compact />
                    </Link>
                    <span className="hidden h-4 w-px bg-white/15 sm:block" />
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
