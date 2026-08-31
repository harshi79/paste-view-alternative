'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Logo from './Logo';
import EmojiStatus from './EmojiStatus';
import NotificationBell from './NotificationBell';
import type { StickerEntry } from '@/lib/stickerPack';

export type NavUser = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  statusEmoji?: string | null;
  statusSticker?: StickerEntry | null;
} | null;

export default function Nav({ session }: { session: NavUser }) {
  const [busy, setBusy] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setAccountOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
        setMobileOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function logout() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    setBusy(false);
    setAccountOpen(false);
    setMobileOpen(false);
    window.location.href = '/';
  }

  const primaryHref = '/paste';
  const desktopLinks = session
    ? [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/bookmarks', label: 'Saved' },
        { href: '/settings', label: 'Studio' },
      ]
    : [];

  const mobileLinks = session
    ? [
        { href: '/dashboard', label: 'Dashboard', description: 'Manage your pastes and links.' },
        { href: '/bookmarks', label: 'Saved posts', description: 'Reopen every paste you bookmarked.' },
        { href: `/u/${session.username}`, label: 'Profile', description: 'Open your public profile page.' },
        { href: '/settings', label: 'Studio', description: 'Customize your profile and name effects.' },
        { href: '/account', label: 'Account', description: 'Password, recovery email, and session controls.' },
      ]
    : [
        { href: '/login', label: 'Log in', description: 'Access saved pastes and your dashboard.' },
        { href: '/register', label: 'Sign up', description: 'Create an account without changing paste creation.' },
      ];

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4 sm:pt-4">
      <nav
        ref={navRef}
        className="glass mx-auto w-full max-w-7xl rounded-lg px-3 py-2.5 sm:px-4 sm:py-3"
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/" className="flex min-w-0 flex-1 items-center gap-3 pr-1" aria-label="VibeBin home">
            <Logo />
            <div className="hidden min-w-0 lg:block">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-brand-300">
                Developer pastebin
              </p>
              <p className="truncate font-mono text-[11px] text-zinc-500">
                Plain text, code, and rich content in one polished workspace.
              </p>
            </div>
          </Link>

          {desktopLinks.length > 0 && (
            <div className="hidden md:flex items-center gap-1 rounded-md border-2 border-[color:var(--vb-line-soft)] bg-black/30 p-1">
              {desktopLinks.map((link) => (
                <NavLink key={link.href} href={link.href} label={link.label} active={pathname === link.href} />
              ))}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Link href={primaryHref} className="btn-primary !rounded-md !px-3.5 !py-2 text-sm uppercase tracking-wide sm:!px-4">
              <span className="sm:hidden">Create</span>
              <span className="hidden sm:inline">Create paste</span>
            </Link>

            {session && (
              <NotificationBell
                onOpen={() => {
                  setAccountOpen(false);
                  setMobileOpen(false);
                }}
              />
            )}

            {session ? (
              <div className="relative">
                <button
                  onClick={() => {
                    setAccountOpen((open) => !open);
                    setMobileOpen(false);
                  }}
                  className="inline-flex items-center gap-2 rounded-md border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] py-1 pl-1 pr-2.5 text-sm font-semibold text-zinc-100 transition-colors hover:border-[#40404f] hover:bg-[#1a1a24] sm:pr-3"
                  title="Account menu"
                  aria-expanded={accountOpen}
                >
                  {session.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={session.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-8 w-8 place-items-center rounded-md bg-brand-600 text-xs font-black text-white">
                      {(session.displayName || session.username).slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="hidden max-w-[132px] truncate sm:block">
                    <EmojiStatus
                      value={session.statusEmoji}
                      pack={session.statusSticker ? [session.statusSticker] : undefined}
                      className="mr-1"
                    />
                    {session.displayName || session.username}
                  </span>
                  <span className={`hidden text-zinc-500 transition-transform sm:block ${accountOpen ? 'rotate-180' : ''}`}>
                    ▾
                  </span>
                </button>

                {accountOpen && (
                  <div className="animate-pop absolute right-0 top-[calc(100%+0.65rem)] z-50 w-[min(16rem,calc(100vw-2rem))] overflow-hidden rounded-xl border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-panel)] p-2 shadow-[6px_6px_0_0_var(--vb-ink)]">
                    <div className="rounded-md border border-[color:var(--vb-line-soft)] bg-[color:var(--vb-inset)] px-3 py-3 text-xs text-zinc-400">
                      <p className="font-semibold text-zinc-200">{session.displayName || session.username}</p>
                      <p className="mt-1 font-mono text-[11px] text-zinc-500">@{session.username}</p>
                    </div>
                    <div className="mt-2 space-y-1">
                      <MenuLink href={`/u/${session.username}`} label="View profile" />
                      <MenuLink href="/settings" label="Profile studio" />
                      <MenuLink href="/dashboard" label="My pastes" />
                      <MenuLink href="/bookmarks" label="Saved posts" />
                      <MenuLink href="/account" label="Account & security" />
                    </div>
                    <div className="my-2 border-t-2 border-dashed border-[color:var(--vb-line-soft)]" />
                    <button
                      onClick={logout}
                      disabled={busy}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-bold uppercase tracking-wide text-zinc-300 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                    >
                      Log out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden items-center gap-2 md:flex">
                <Link href="/login" className="btn-ghost !rounded-md !px-3.5 !py-2 text-sm">
                  Log in
                </Link>
                <Link href="/register" className="btn-primary !rounded-md !px-4 !py-2 text-sm uppercase tracking-wide">
                  Sign up
                </Link>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setMobileOpen((open) => !open);
                setAccountOpen(false);
              }}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] text-zinc-200 transition-colors hover:border-[#40404f] hover:bg-[#1a1a24] md:hidden"
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-panel"
              aria-label="Toggle navigation menu"
            >
              <span className="text-lg leading-none">{mobileOpen ? '×' : '☰'}</span>
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div
            id="mobile-nav-panel"
            className="animate-pop mt-3 grid gap-2 rounded-lg border-2 border-dashed border-[color:var(--vb-line)] bg-black/20 p-2 md:hidden"
          >
            {!session && (
              <div className="grid grid-cols-2 gap-2 pb-1">
                <Link href="/login" className="btn-ghost !rounded-md !px-3 !py-2.5 text-sm">
                  Log in
                </Link>
                <Link href="/register" className="btn-primary !rounded-md !px-3 !py-2.5 text-sm">
                  Sign up
                </Link>
              </div>
            )}

            {mobileLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md border-2 px-3.5 py-3 text-left transition-colors ${
                  pathname === link.href
                    ? 'border-brand-400/60 bg-brand-500/10'
                    : 'border-[color:var(--vb-line-soft)] bg-[color:var(--vb-panel-2)] hover:border-[color:var(--vb-line)] hover:bg-[#1a1a24]'
                }`}
              >
                <p className="text-sm font-semibold text-white">{link.label}</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">{link.description}</p>
              </Link>
            ))}
          </div>
        )}
      </nav>
    </header>
  );
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-md px-3.5 py-2 text-sm font-bold uppercase tracking-wide transition-all ${
        active
          ? 'bg-brand-600 text-white shadow-[2px_2px_0_0_var(--vb-ink)]'
          : 'text-zinc-400 hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      {label}
    </Link>
  );
}

function MenuLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.06] hover:text-white"
    >
      {label}
    </Link>
  );
}
