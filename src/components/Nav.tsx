'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
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

export const NAV_HREFS = {
  home: '/',
  latest: '/latest',
  trending: '/trending',
  search: '/search',
  saved: '/bookmarks',
  notifications: '/notifications',
  create: '/paste',
} as const;

export function profileHref(username: string): string {
  return `/u/${username}`;
}

export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

type NavItem = { id: string; href: string; label: string };

const PRIMARY_ITEMS: NavItem[] = [
  { id: 'home', href: NAV_HREFS.home, label: 'Home' },
  { id: 'latest', href: NAV_HREFS.latest, label: 'Latest' },
  { id: 'trending', href: NAV_HREFS.trending, label: 'Trending' },
  { id: 'search', href: NAV_HREFS.search, label: 'Search' },
  { id: 'saved', href: NAV_HREFS.saved, label: 'Saved' },
];

function Icon({ name, className = 'h-5 w-5' }: { name: string; className?: string }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true as const,
  };
  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
        </svg>
      );
    case 'latest':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4.5l3 1.5" />
        </svg>
      );
    case 'trending':
      return (
        <svg {...common}>
          <path d="M4 16.5 9.5 11l3.5 3.5L20 7" />
          <path d="M14 7h6v6" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case 'saved':
      return (
        <svg {...common}>
          <path d="M7 4.5h10A1.5 1.5 0 0 1 18.5 6v14L12 16.5 5.5 20V6A1.5 1.5 0 0 1 7 4.5Z" />
        </svg>
      );
    case 'notifications':
      return (
        <svg {...common}>
          <path d="M6.5 9.5a5.5 5.5 0 1 1 11 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5Z" />
          <path d="M10 18.5a2 2 0 0 0 4 0" />
        </svg>
      );
    case 'profile':
      return (
        <svg {...common}>
          <circle cx="12" cy="9" r="3.25" />
          <path d="M6 18.5a6 6 0 0 1 12 0" />
        </svg>
      );
    case 'create':
      return (
        <svg {...common}>
          <path d="M12 6v12M6 12h12" />
        </svg>
      );
    case 'more':
      return (
        <svg {...common}>
          <circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Nav({ session }: { session: NavUser }) {
  const [busy, setBusy] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerTitleId = useId();

  useEffect(() => {
    setAccountOpen(false);
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    drawerRef.current?.querySelector<HTMLElement>('button, a')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  async function logout() {
    setBusy(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    setBusy(false);
    setAccountOpen(false);
    setDrawerOpen(false);
    window.location.href = '/';
  }

  const profileUrl = session ? profileHref(session.username) : '/login';

  function itemCurrent(href: string) {
    return isActivePath(pathname, href) ? 'page' : undefined;
  }

  const drawerLinks: { href: string; label: string; description: string; id: string }[] = session
    ? [
        { id: 'trending', href: NAV_HREFS.trending, label: 'Trending', description: 'Popular posts — coming soon.' },
        { id: 'saved', href: NAV_HREFS.saved, label: 'Saved', description: 'Reopen every paste you bookmarked.' },
        {
          id: 'notifications',
          href: NAV_HREFS.notifications,
          label: 'Notifications',
          description: 'Your activity inbox.',
        },
        { id: 'profile', href: profileUrl, label: 'Profile', description: 'Open your public profile page.' },
        { id: 'dashboard', href: '/dashboard', label: 'My pastes', description: 'Manage your pastes and links.' },
        { id: 'studio', href: '/settings', label: 'Studio', description: 'Customize your profile and name effects.' },
        { id: 'account', href: '/account', label: 'Account', description: 'Password, recovery email, and session.' },
      ]
    : [
        { id: 'trending', href: NAV_HREFS.trending, label: 'Trending', description: 'Popular posts — coming soon.' },
        { id: 'saved', href: NAV_HREFS.saved, label: 'Saved', description: 'Sign in to see saved posts.' },
        { id: 'login', href: '/login', label: 'Log in', description: 'Access saved pastes and your dashboard.' },
        { id: 'register', href: '/register', label: 'Sign up', description: 'Create an account to join the community.' },
      ];

  return (
    <>
      <a href="#main-content" className="app-skip-link">
        Skip to content
      </a>

      <aside
        data-nav="desktop-sidebar"
        className="app-sidebar fixed inset-y-0 left-0 z-30 hidden w-[var(--vb-sidebar)] flex-col overflow-y-auto overflow-x-hidden px-3 py-4 lg:flex"
        aria-label="Primary"
      >
        <Link href="/" className="mb-5 flex min-w-0 items-center px-2" aria-label="VibeBin home">
          <Logo />
        </Link>

        <nav aria-label="Primary" className="flex min-w-0 flex-col gap-0.5">
          {PRIMARY_ITEMS.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              data-nav-item={item.id}
              aria-current={itemCurrent(item.href)}
              className="app-nav-link"
            >
              <Icon name={item.id} />
              <span className="min-w-0 truncate">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="mt-4 px-1">
          <Link href={NAV_HREFS.create} data-nav-item="create" className="btn-primary w-full !px-3 !py-2.5 text-sm">
            Create
          </Link>
        </div>

        {session && (
          <Link
            href={NAV_HREFS.notifications}
            data-nav-item="notifications"
            aria-current={itemCurrent(NAV_HREFS.notifications)}
            className="app-nav-link mt-3"
          >
            <Icon name="notifications" />
            <span className="min-w-0 truncate">Notifications</span>
          </Link>
        )}

        <div className="mt-auto min-w-0 border-t border-[color:var(--vb-line-soft)] pt-3">
          {session ? (
            <Link
              href={profileUrl}
              data-nav-item="profile"
              aria-current={itemCurrent(profileUrl)}
              className="app-nav-link"
            >
              {session.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={session.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-black text-white">
                  {(session.displayName || session.username).slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-1 truncate text-sm font-semibold text-zinc-100">
                  <EmojiStatus
                    value={session.statusEmoji}
                    pack={session.statusSticker ? [session.statusSticker] : undefined}
                    className="shrink-0"
                  />
                  <span className="truncate">{session.displayName || session.username}</span>
                </span>
                <span className="block truncate font-mono text-[11px] text-zinc-500">@{session.username}</span>
              </span>
            </Link>
          ) : (
            <div className="flex flex-col gap-2 px-1">
              <Link href="/login" className="btn-ghost w-full !px-3 !py-2 text-sm">
                Log in
              </Link>
              <Link href="/register" className="btn-primary w-full !px-3 !py-2 text-sm">
                Sign up
              </Link>
            </div>
          )}
        </div>
      </aside>

      <header
        ref={headerRef}
        data-nav="header"
        className="app-header sticky top-0 z-40 flex h-[var(--vb-header)] items-center gap-2 overflow-x-hidden px-3 sm:px-4 lg:fixed lg:left-[var(--vb-sidebar)] lg:right-0 lg:px-6"
      >
        <Link href="/" className="min-w-0 lg:hidden" aria-label="VibeBin home">
          <Logo compact />
        </Link>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {session && (
            <NotificationBell
              onOpen={() => {
                setAccountOpen(false);
                setDrawerOpen(false);
              }}
            />
          )}

          {!session && (
            <Link href="/login" className="btn-ghost !rounded-md !px-3 !py-2 text-sm lg:hidden">
              Log in
            </Link>
          )}

          {session ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setAccountOpen((open) => !open);
                  setDrawerOpen(false);
                }}
                className="inline-flex min-h-11 min-w-11 items-center gap-2 rounded-md border border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] py-1 pl-1 pr-2 text-sm font-semibold text-zinc-100 transition-colors hover:border-[#2e2e2e] hover:bg-[#161616] sm:pr-3"
                title="Account menu"
                aria-expanded={accountOpen}
                aria-haspopup="menu"
              >
                {session.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={session.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-xs font-black text-white">
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
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(16rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-[color:var(--vb-line)] bg-[color:var(--vb-panel)] p-2 shadow-lg"
                >
                  <div className="rounded-md border border-[color:var(--vb-line-soft)] bg-[color:var(--vb-inset)] px-3 py-3 text-xs text-zinc-400">
                    <p className="truncate font-semibold text-zinc-200">{session.displayName || session.username}</p>
                    <p className="mt-1 truncate font-mono text-[11px] text-zinc-500">@{session.username}</p>
                  </div>
                  <div className="mt-2 space-y-1">
                    <MenuLink href={profileUrl} label="View profile" />
                    <MenuLink href="/settings" label="Profile studio" />
                    <MenuLink href="/dashboard" label="My pastes" />
                    <MenuLink href={NAV_HREFS.saved} label="Saved posts" />
                    <MenuLink href="/account" label="Account & security" />
                  </div>
                  <div className="my-2 border-t border-[color:var(--vb-line-soft)]" />
                  <button
                    type="button"
                    onClick={logout}
                    disabled={busy}
                    className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-bold uppercase tracking-wide text-zinc-300 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden items-center gap-2 md:flex lg:hidden">
              <Link href="/login" className="btn-ghost !rounded-md !px-3.5 !py-2 text-sm">
                Log in
              </Link>
              <Link href="/register" className="btn-primary !rounded-md !px-4 !py-2 text-sm">
                Sign up
              </Link>
            </div>
          )}
        </div>
      </header>

      <nav
        data-nav="mobile-bottom"
        aria-label="Primary"
        className="app-bottom-nav fixed inset-x-0 bottom-0 z-40 overflow-x-hidden lg:hidden"
      >
        <Link
          href={NAV_HREFS.home}
          data-nav-item="home"
          aria-current={itemCurrent(NAV_HREFS.home)}
          className="app-bottom-item"
        >
          <Icon name="home" />
          <span className="max-w-full truncate">Home</span>
        </Link>
        <Link
          href={NAV_HREFS.latest}
          data-nav-item="latest"
          aria-current={itemCurrent(NAV_HREFS.latest)}
          className="app-bottom-item"
        >
          <Icon name="latest" />
          <span className="max-w-full truncate">Latest</span>
        </Link>
        <Link
          href={NAV_HREFS.create}
          data-nav-item="create"
          aria-label="Create paste"
          className="app-bottom-item text-brand-300"
        >
          <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-600 text-white">
            <Icon name="create" className="h-4 w-4" />
          </span>
          <span className="max-w-full truncate">Create</span>
        </Link>
        <Link
          href={NAV_HREFS.search}
          data-nav-item="search"
          aria-current={itemCurrent(NAV_HREFS.search)}
          className="app-bottom-item"
        >
          <Icon name="search" />
          <span className="max-w-full truncate">Search</span>
        </Link>
        <button
          type="button"
          data-nav-item="more"
          className="app-bottom-item"
          aria-expanded={drawerOpen}
          aria-controls="mobile-nav-drawer"
          aria-label="Open more navigation"
          onClick={() => {
            setDrawerOpen((open) => !open);
            setAccountOpen(false);
          }}
        >
          <Icon name="more" />
          <span className="max-w-full truncate">More</span>
        </button>
      </nav>

      {drawerOpen && (
        <>
          <div
            aria-hidden
            className="fixed inset-0 z-50 bg-black/70 lg:hidden"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            ref={drawerRef}
            id="mobile-nav-drawer"
            data-nav="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby={drawerTitleId}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[min(80dvh,36rem)] overflow-y-auto overflow-x-hidden rounded-t-xl border-t border-[color:var(--vb-line)] bg-[color:var(--vb-panel)] px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 lg:hidden"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <p id={drawerTitleId} className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                More
              </p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="grid h-11 w-11 place-items-center rounded-md border border-[color:var(--vb-line)] text-lg text-zinc-300"
                aria-label="Close more navigation"
              >
                ×
              </button>
            </div>
            <div className="grid gap-2">
              {drawerLinks.map((link) => (
                <Link
                  key={link.id}
                  href={link.href}
                  data-nav-item={link.id}
                  aria-current={itemCurrent(link.href)}
                  className={`min-h-11 rounded-md border px-3.5 py-3 text-left ${
                    isActivePath(pathname, link.href)
                      ? 'border-brand-400/50 bg-brand-500/10'
                      : 'border-[color:var(--vb-line-soft)] bg-[color:var(--vb-panel-2)]'
                  }`}
                >
                  <p className="text-sm font-semibold text-white">{link.label}</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">{link.description}</p>
                </Link>
              ))}
              {session && (
                <button
                  type="button"
                  onClick={logout}
                  disabled={busy}
                  className="min-h-11 rounded-md border border-[color:var(--vb-line-soft)] px-3.5 py-3 text-left text-sm font-bold uppercase tracking-wide text-zinc-300 hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
                >
                  Log out
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function MenuLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex min-h-11 items-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.06] hover:text-white"
    >
      {label}
    </Link>
  );
}
