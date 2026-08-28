'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export type NavUser = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
} | null;

export default function Nav({ session }: { session: NavUser }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function logout() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    setBusy(false);
    setOpen(false);
    router.push('/');
    router.refresh();
  }

  const links = [
    { href: '/', label: 'New paste' },
    ...(session
      ? [
          { href: '/dashboard', label: 'My pastes' },
          { href: '/settings', label: 'Profile' },
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-night-950/70 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-cyan-400 text-base font-black text-night-950 shadow-lg shadow-brand-600/30 transition-transform group-hover:scale-110">
            ⚡
          </span>
          <span className="text-lg font-extrabold tracking-tight">
            Vibe
            <span className="bg-gradient-to-r from-brand-400 to-cyan-300 bg-clip-text text-transparent">
              Bin
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                pathname === l.href
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {l.label}
            </Link>
          ))}

          {session ? (
            <div className="relative ml-1" ref={menuRef}>
              <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 text-sm font-medium text-zinc-200 transition-colors hover:border-white/25"
                title="Account menu"
              >
                {session.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.avatarUrl}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-cyan-400 text-xs font-bold text-night-950">
                    {(session.displayName || session.username).slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="hidden max-w-[120px] truncate sm:block">
                  {session.displayName || session.username}
                </span>
                <span className="text-zinc-500">▾</span>
              </button>

              {open && (
                <div className="animate-pop absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-night-900/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl">
                  <div className="border-b border-white/5 px-3 py-2 text-xs text-zinc-500">
                    Signed in as{' '}
                    <span className="font-mono text-zinc-300">@{session.username}</span>
                  </div>
                  <MenuLink href={`/u/${session.username}`} label="View profile" />
                  <MenuLink href="/settings" label="Edit profile" />
                  <MenuLink href="/dashboard" label="My pastes" />
                  <MenuLink href="/account" label="Account & rename" />
                  <div className="my-1 border-t border-white/5" />
                  <button
                    onClick={logout}
                    disabled={busy}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-300 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="ml-1 flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:text-white"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition-transform hover:scale-[1.03]"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </nav>
    </header>
  );
}

function MenuLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-white/5 hover:text-white"
    >
      {label}
    </Link>
  );
}
