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
      <body className="font-sans antialiased relative">
        {/* ambient background glows */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-32 left-1/2 h-[440px] w-[680px] -translate-x-1/2 rounded-full bg-brand-600/[0.16] blur-[110px]" />
          <div className="absolute bottom-0 right-0 h-[300px] w-[400px] rounded-full bg-cyan-500/[0.08] blur-[100px]" />
          <div className="absolute top-1/3 -left-24 h-[280px] w-[280px] rounded-full bg-fuchsia-500/[0.08] blur-[90px]" />
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

        <main className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">{children}</main>

        <footer className="border-t border-white/[0.06] py-8">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-zinc-500 sm:flex-row sm:px-6">
            <p className="flex items-center gap-3">
              <Link href="/" className="transition-opacity hover:opacity-80" aria-label="VibeBin home">
                <Logo compact />
              </Link>
              <span className="hidden h-4 w-px bg-white/10 sm:block" />
              <span>Developer pastebin.</span>
            </p>
            <p className="text-zinc-600">Syntax highlighting · Expiring links · Rich text</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
