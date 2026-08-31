'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationRow } from '@/lib/notifications';
import NotificationItem from './NotificationItem';

/** The dropdown/sheet shows exactly the latest 10 notifications. */
export const LATEST_LIMIT = 10;

/**
 * Lightweight badge poll interval. VibeBin has no WebSocket/SSE/EventSource
 * infrastructure, so the smallest compatible "live" mechanism is a quiet poll
 * of the unread-count endpoint — a single indexed COUNT — to keep the badge
 * visible while the user is actively using the site. 30s matches the app's
 * existing client poll (AccountPanel) and stays well under a request/minute.
 */
export const POLL_INTERVAL_MS = 30_000;

/** Compact badge text — the real unread count, capped for display only. */
export function formatUnreadBadge(count: number): string {
  if (count <= 0) return '';
  if (count > 99) return '99+';
  return String(count);
}

type Props = {
  /** Called right before the panel opens so the navbar can close its other popovers. */
  onOpen?: () => void;
};

/**
 * Logged-in notification bell + badge + dropdown (desktop) / sheet (mobile).
 *
 * Only rendered by the navbar when a session exists, so guests never see
 * any of this UI. Consumes the Chat 1 endpoints exactly as provided:
 *
 *   GET  /api/notifications/unread-count        → badge (also on mount)
 *   GET  /api/notifications/latest?limit=10     → dropdown list (re-fetched
 *                                                 every time it opens) + a
 *                                                 fresh authoritative unreadCount
 *   POST /api/notifications/<id>/read           → mark one read
 *   POST /api/notifications/read-all            → mark all read
 *
 * The badge is never invented locally — it is always seeded/overwritten by
 * an API response and decremented optimistically only until the server
 * answers with the authoritative count.
 */
export default function NotificationBell({ onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<'failed' | 'signed-out' | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/unread-count');
      if (!res.ok) return;
      const body = await res.json();
      if (typeof body?.count === 'number') setUnreadCount(body.count);
    } catch {
      // Badge keeps its current value; the next open/action resyncs it.
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notifications/latest?limit=${LATEST_LIMIT}`);
      if (res.status === 401) {
        setError('signed-out');
        return;
      }
      if (!res.ok) throw new Error(`latest failed: ${res.status}`);
      const body = await res.json();
      const list = Array.isArray(body?.notifications) ? body.notifications : [];
      setNotifications(list.slice(0, LATEST_LIMIT));
      if (typeof body?.unreadCount === 'number') setUnreadCount(body.unreadCount);
    } catch {
      setError('failed');
    } finally {
      setLoading(false);
    }
  }, []);

  // Seed the badge once on mount (the bell is only mounted for logged-in
  // users, so guests never issue this request).
  useEffect(() => {
    void fetchUnreadCount();
  }, [fetchUnreadCount]);

  // ------------------------------------------------------------------
  // Live badge polling. The bell is only rendered for signed-in users,
  // so every poll here is auth-scoped by construction. Only the unread
  // count is fetched (one indexed COUNT) — never the list — so it can't
  // duplicate the request the dropdown makes on open, can't create
  // duplicate rows, and can't fight the optimistic mark-read state.
  // It runs only while the page is visible, catches up on a
  // visibility change (so an inactive user sees the correct badge when
  // they return), and is torn down on unmount.
  // ------------------------------------------------------------------
  useEffect(() => {
    function poll() {
      if (document.visibilityState !== 'visible') return;
      void fetchUnreadCount();
    }
    const id = window.setInterval(poll, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [fetchUnreadCount]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      onOpen?.();
      void refresh();
    }
  }

  const markRead = useCallback(
    async (n: NotificationRow) => {
      if (n.isRead) return;
      // Optimistic UI — the server response carries the authoritative count.
      setNotifications((prev) => (prev ? prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)) : prev));
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        const res = await fetch(`/api/notifications/${n.id}/read`, { method: 'POST' });
        if (!res.ok) throw new Error(`mark read failed: ${res.status}`);
        const body = await res.json();
        if (typeof body?.unreadCount === 'number') setUnreadCount(body.unreadCount);
      } catch {
        setNotifications((prev) => (prev ? prev.map((x) => (x.id === n.id ? { ...x, isRead: false } : x)) : prev));
        void fetchUnreadCount();
      }
    },
    [fetchUnreadCount],
  );

  const markAll = useCallback(async () => {
    setMarkingAll(true);
    try {
      const res = await fetch('/api/notifications/read-all', { method: 'POST' });
      if (!res.ok) throw new Error(`mark all failed: ${res.status}`);
      const body = await res.json();
      setNotifications((prev) => (prev ? prev.map((x) => ({ ...x, isRead: true })) : prev));
      setUnreadCount(typeof body?.unreadCount === 'number' ? body.unreadCount : 0);
    } catch {
      // Leave the list untouched; the next refresh resyncs with the backend.
    } finally {
      setMarkingAll(false);
    }
  }, []);

  // Close when clicking/tapping outside the bell + panel, or on Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: Event) {
      const target = e.target as Node | null;
      if (rootRef.current && target && rootRef.current.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        bellRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Close after navigating (notification link or "See all notifications").
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const badge = formatUnreadBadge(unreadCount);
  const hasList = notifications !== null;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={bellRef}
        type="button"
        onClick={toggle}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] text-zinc-200 transition-colors hover:border-[#40404f] hover:bg-[#1a1a24]"
        aria-label={badge ? `Notifications, ${badge} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notification-panel"
        title="Notifications"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden
        >
          <path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
        {badge && (
          <span
            aria-hidden
            className="absolute -right-1.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full border-2 border-[color:var(--vb-panel-2)] bg-red-500 px-1 text-[10px] font-black leading-[14px] text-white"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Mobile-only scrim behind the sheet. */}
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
          />

          <div
            id="notification-panel"
            role="dialog"
            aria-label="Notifications"
            className="animate-pop fixed inset-x-2 bottom-2 z-50 flex max-h-[min(74dvh,32rem)] flex-col overflow-hidden rounded-xl border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-panel)] shadow-[6px_6px_0_0_var(--vb-ink)] md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-[calc(100%+0.65rem)] md:max-h-[26rem] md:w-[24rem]"
          >
            <div className="flex items-center justify-between gap-2 border-b-2 border-dashed border-[color:var(--vb-line-soft)] px-4 py-3">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-brand-300">
                Notifications
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void markAll()}
                  disabled={unreadCount === 0 || markingAll}
                  className="rounded-md border border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400 transition-colors hover:border-[#40404f] hover:text-white disabled:opacity-50"
                >
                  {markingAll ? 'Marking…' : 'Mark all as read'}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close notifications"
                  className="grid h-9 w-9 place-items-center rounded-md border border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] text-lg leading-none text-zinc-400 transition-colors hover:border-[#40404f] hover:text-white md:hidden"
                >
                  ×
                </button>
              </div>
            </div>

            <ul className="min-h-0 flex-1 divide-y divide-[color:var(--vb-line-soft)] overflow-y-auto overscroll-contain">
              {error === 'signed-out' ? (
                <li className="px-4 py-8 text-center">
                  <p className="text-sm text-zinc-400">Sign in to view notifications.</p>
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="mt-2 inline-block text-sm font-bold text-brand-300 transition-colors hover:text-brand-200"
                  >
                    Log in
                  </Link>
                </li>
              ) : error === 'failed' ? (
                <li className="px-4 py-8 text-center">
                  <p className="text-sm text-zinc-400">Couldn&apos;t load notifications.</p>
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    className="mt-3 rounded-md border border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-300 transition-colors hover:border-[#40404f] hover:text-white"
                  >
                    Try again
                  </button>
                </li>
              ) : !hasList && loading ? (
                <li aria-hidden className="space-y-4 px-4 py-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-3 w-2/3 rounded bg-white/10" />
                      <div className="mt-2 h-3 w-1/3 rounded bg-white/[0.06]" />
                    </div>
                  ))}
                </li>
              ) : notifications && notifications.length === 0 ? (
                <li className="px-4 py-8 text-center">
                  <span
                    aria-hidden
                    className="mx-auto grid h-10 w-10 place-items-center rounded-md border border-[color:var(--vb-line-soft)] bg-[color:var(--vb-inset)] text-lg"
                  >
                    🔔
                  </span>
                  <p className="mt-3 text-sm font-semibold text-zinc-300">
                    You&apos;re all caught up.
                  </p>
                </li>
              ) : (
                notifications?.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onActivate={(item) => void markRead(item)}
                    onMarkRead={(item) => void markRead(item)}
                  />
                ))
              )}
            </ul>

            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block border-t-2 border-dashed border-[color:var(--vb-line-soft)] px-4 py-3 text-center text-sm font-bold uppercase tracking-wide text-brand-300 transition-colors hover:bg-white/[0.06] hover:text-brand-200"
            >
              See all notifications →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
