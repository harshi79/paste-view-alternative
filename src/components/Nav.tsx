'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Logo from './Logo';

export type NavUser = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  statusEmoji?: string | null;
} | null;

export default function Nav({ session }: { session: NavUser }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
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
    window.location.href = '/';
  }

  const links = [
    { href: '/', label: 'New paste' },
    ...(session
      ? [
          { href: '/dashboard', label: 'Dashboard' },
          { href: '/settings', label: 'Studio' },
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4 sm:pt-4">
      <nav className="glass mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 rounded-[24px] px-3 py-3 sm:px-4">
        <Link href="/" className="flex min-w-0 flex-1 items-center gap-3" aria-label="VibeBin home">
          <Logo />
          <div className="hidden min-w-0 md:block">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-300">
              Developer pastebin
            </p>
            <p className="truncate text-xs text-zinc-500">
              One editor for plain text, code, and rich content.
            </p>
          </div>
        </Link>

        <div className="order-3 flex w-full items-center gap-1 overflow-x-auto rounded-2xl border border-white/[0.08] bg-black/10 p-1 sm:order-2 sm:w-auto sm:flex-1 sm:justify-center sm:border-transparent sm:bg-transparent sm:p-0">
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold transition-all ${
                  active
                    ? 'bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                    : 'text-zinc-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        {session ? (
          <div className="relative order-2 sm:order-3" ref={menuRef}>
            <button
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 text-sm font-medium text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors hover:border-white/20 hover:bg-white/[0.08]"
              title="Account menu"
            >
              {session.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={session.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : (
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-cyan-400 text-xs font-bold text-night-950">
                  {(session.displayName || session.username).slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="hidden max-w-[132px] truncate sm:block">
                {session.statusEmoji && <span className="mr-1">{session.statusEmoji}</span>}
                {session.displayName || session.username}
              </span>
              <span className={`text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
            </button>

            {open && (
              <div className="animate-pop absolute right-3 top-[calc(100%-6px)] mt-3 w-60 overflow-hidden rounded-[22px] border border-white/10 bg-night-900/95 p-2 shadow-2xl shadow-black/60 backdrop-blur-xl sm:right-4">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-xs text-zinc-400">
                  <p className="font-semibold text-zinc-200">{session.displayName || session.username}</p>
                  <p className="mt-1 font-mono text-[11px] text-zinc-500">@{session.username}</p>
                </div>
                <div className="mt-2 space-y-1">
                  <MenuLink href={`/u/${session.username}`} label="View profile" />
                  <MenuLink href="/settings" label="Profile studio" />
                  <MenuLink href="/dashboard" label="My pastes" />
                  <MenuLink href="/account" label="Account & security" />
                </div>
                <div className="my-2 border-t border-white/6" />
                <button
                  onClick={logout}
                  disabled={busy}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-zinc-300 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="order-2 flex items-center gap-2 sm:order-3">
            <Link href="/login" className="btn-ghost !px-3.5 !py-2 text-sm">
              Log in
            </Link>
            <Link href="/register" className="btn-primary text-sm">
              Sign up
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}

function MenuLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/5 hover:text-white"
    >
      {label}
    </Link>
  );
}
