import type { Metadata, Viewport } from 'next';
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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  const statusSticker = session?.profile.statusEmoji
    ? await loadStickerByToken(session.profile.statusEmoji)
    : null;

  return (
    <html lang="en">
      <body className="relative overflow-x-clip font-sans antialiased">
        <CursorTrail />
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-50 h-px bg-brand-600/80"
        />

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

        <div className="min-w-0 lg:pl-[var(--vb-sidebar)]">
          <main
            id="main-content"
            className="mx-auto w-full max-w-7xl min-w-0 px-4 pb-[calc(var(--vb-bottom-nav)+1.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:pb-12 lg:pt-[calc(var(--vb-header)+0.75rem)]"
          >
            {children}
          </main>

          <footer className="hidden pb-10 lg:block">
            <div className="mx-auto w-full max-w-7xl min-w-0 px-4 sm:px-6">
              <div className="flex flex-col gap-3 border-t border-[color:var(--vb-line)] px-1 py-6 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
                <Link href="/" className="transition-opacity hover:opacity-85" aria-label="VibeBin home">
                  <Logo compact />
                </Link>
                <p className="min-w-0 break-words">Share code, notes, and styled snippets with a polished link.</p>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
