import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import Nav from '@/components/Nav';
import { getSessionUser } from '@/lib/auth';

export const metadata: Metadata = {
  title: {
    default: 'VibeBin — Share pastes and customizable profiles',
    template: '%s · VibeBin',
  },
  description:
    'A free PasteView alternative: share pastes with syntax highlighting, expiring links, password protection, and rich-text formatting. Customize your profile with animated names, video banners and colored links — all free.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();

  return (
    <html lang="en">
      <body className="font-sans antialiased relative">
        {/* ambient background glows */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-32 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-brand-600/20 blur-[140px]" />
          <div className="absolute bottom-0 right-0 h-[320px] w-[420px] rounded-full bg-cyan-500/10 blur-[120px]" />
          <div className="absolute top-1/3 -left-24 h-[300px] w-[300px] rounded-full bg-fuchsia-500/10 blur-[110px]" />
        </div>

        <Nav
          session={
            session
              ? {
                  username: session.user.username,
                  displayName: session.profile?.displayName ?? null,
                  avatarUrl: session.profile?.avatarUrl ?? null,
                }
              : null
          }
        />

        <main className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">{children}</main>

        <footer className="border-t border-white/5 py-8">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-zinc-500 sm:flex-row sm:px-6">
            <p>
              <Link href="/" className="font-semibold text-zinc-300 hover:text-white">
                VibeBin
              </Link>{' '}
              — a free PasteView alternative.
            </p>
            <p className="text-zinc-600">No premium paywalls · No accounts required for guests</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
