'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationRow } from '@/lib/notifications';
import NotificationItem from './NotificationItem';

const PAGE_SIZE = 20;

type Filter = 'all' | 'unread';
type HistoryResponse = {
  notifications?: NotificationRow[];
  nextCursor?: string | null;
  hasMore?: boolean;
  unreadCount?: number;
};

function isHistoryResponse(value: unknown): value is HistoryResponse {
  return typeof value === 'object' && value !== null;
}

function getRows(body: unknown): NotificationRow[] {
  if (!isHistoryResponse(body) || !Array.isArray(body.notifications)) return [];
  return body.notifications as NotificationRow[];
}

function getUnreadCount(body: unknown): number | null {
  if (!isHistoryResponse(body) || typeof body.unreadCount !== 'number') return null;
  return Math.max(0, body.unreadCount);
}

function mergeUnique(current: NotificationRow[], incoming: NotificationRow[]): NotificationRow[] {
  const seen = new Set(current.map((notification) => notification.id));
  const merged = [...current];
  for (const notification of incoming) {
    if (seen.has(notification.id)) continue;
    seen.add(notification.id);
    merged.push(notification);
  }
  return merged;
}

function BellIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
    </svg>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-3" aria-label="Loading notifications" aria-busy="true">
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className="card flex animate-pulse gap-3.5 rounded-lg px-4 py-4 sm:px-5 sm:py-5"
          aria-hidden
        >
          <div className="h-11 w-11 shrink-0 rounded-md border-2 border-[color:var(--vb-line-soft)] bg-white/[0.06]" />
          <div className="min-w-0 flex-1">
            <div className="h-4 w-3/5 rounded bg-white/10" />
            <div className="mt-3 h-3 w-2/5 rounded bg-white/[0.06]" />
            <div className="mt-3 h-12 w-full rounded-md border border-[color:var(--vb-line-soft)] bg-white/[0.04]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ filter }: { filter: Filter }) {
  const unread = filter === 'unread';
  return (
    <div className="card rounded-lg px-5 py-14 text-center sm:px-8 sm:py-16">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-md border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-inset)] text-brand-300 shadow-[3px_3px_0_0_var(--vb-ink)]">
        <BellIcon className="h-7 w-7" />
      </div>
      <h2 className="mt-5 text-2xl font-black uppercase tracking-tight text-white">
        {unread ? "You're all caught up" : 'No notifications yet'}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
        {unread ? 'No unread notifications.' : "When something happens, you'll see it here."}
      </p>
    </div>
  );
}

function ErrorState({ signedOut, onRetry }: { signedOut: boolean; onRetry: () => void }) {
  return (
    <div className="card rounded-lg px-5 py-12 text-center sm:px-8 sm:py-14">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-md border-2 border-red-500/30 bg-red-500/10 text-xl text-red-300">
        {signedOut ? '↗' : '!'}
      </div>
      <h2 className="mt-4 text-xl font-black uppercase tracking-tight text-white">
        {signedOut ? 'Your session ended' : "Couldn't load notifications"}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
        {signedOut
          ? 'Sign in again to view your notification history.'
          : 'Something went wrong while loading your activity. Your notifications are still safe.'}
      </p>
      {signedOut ? (
        <Link href="/login" className="btn-primary mt-6">
          Log in again
        </Link>
      ) : (
        <button type="button" onClick={onRetry} className="btn-primary mt-6">
          Try again
        </button>
      )}
    </div>
  );
}

export default function NotificationCenter() {
  const [filter, setFilter] = useState<Filter>('all');
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<'failed' | 'signed-out' | null>(null);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingIds, setMarkingIds] = useState<Set<string>>(() => new Set());
  const [actionError, setActionError] = useState(false);

  const requestIdRef = useRef(0);
  const loadingPageRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const hasMoreRef = useRef(false);
  const seenCursorsRef = useRef<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const markingIdsRef = useRef(new Set<string>());

  const historyUrl = useCallback((selectedFilter: Filter, cursor?: string | null) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (selectedFilter === 'unread') params.set('filter', 'unread');
    if (cursor) params.set('cursor', cursor);
    return `/api/notifications?${params.toString()}`;
  }, []);

  const loadFirstPage = useCallback(async (selectedFilter: Filter) => {
    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    loadingPageRef.current = true;
    loadingMoreRef.current = false;
    cursorRef.current = null;
    hasMoreRef.current = false;
    seenCursorsRef.current = new Set();

    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setLoadMoreError(false);
    setNotifications([]);
    setHasMore(false);

    try {
      const response = await fetch(historyUrl(selectedFilter), { signal: controller.signal });
      if (response.status === 401) {
        if (requestId === requestIdRef.current) setError('signed-out');
        return;
      }
      if (!response.ok) throw new Error('history request failed');
      const body: unknown = await response.json();
      if (requestId !== requestIdRef.current) return;

      const rows = getRows(body);
      const cursor = isHistoryResponse(body) && typeof body.nextCursor === 'string' ? body.nextCursor : null;
      const more = Boolean(isHistoryResponse(body) && body.hasMore && cursor);
      setNotifications(rows);
      setHasMore(more);
      cursorRef.current = cursor;
      hasMoreRef.current = more;
      const count = getUnreadCount(body);
      if (count !== null) setUnreadCount(count);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      if (requestId === requestIdRef.current) setError('failed');
    } finally {
      if (requestId === requestIdRef.current) {
        loadingPageRef.current = false;
        setLoading(false);
      }
    }
  }, [historyUrl]);

  useEffect(() => {
    void loadFirstPage(filter);
    return () => abortRef.current?.abort();
  }, [filter, loadFirstPage]);

  const loadMore = useCallback(async () => {
    const cursor = cursorRef.current;
    if (
      loadingPageRef.current ||
      loadingMoreRef.current ||
      !hasMoreRef.current ||
      !cursor ||
      seenCursorsRef.current.has(cursor)
    ) {
      return;
    }

    const requestId = requestIdRef.current;
    const selectedFilter = filter;
    loadingMoreRef.current = true;
    seenCursorsRef.current.add(cursor);
    setLoadingMore(true);
    setLoadMoreError(false);

    try {
      const response = await fetch(historyUrl(selectedFilter, cursor));
      if (response.status === 401) {
        if (requestId === requestIdRef.current) setError('signed-out');
        return;
      }
      if (!response.ok) throw new Error('load more request failed');
      const body: unknown = await response.json();
      if (requestId !== requestIdRef.current) return;

      const rows = getRows(body);
      const newCursor = isHistoryResponse(body) && typeof body.nextCursor === 'string' ? body.nextCursor : null;
      const nextHasMore = Boolean(
        isHistoryResponse(body) &&
          body.hasMore &&
          newCursor &&
          newCursor !== cursor &&
          !seenCursorsRef.current.has(newCursor),
      );
      setNotifications((current) => mergeUnique(current, rows));
      setHasMore(nextHasMore);
      cursorRef.current = newCursor;
      hasMoreRef.current = nextHasMore;
      const count = getUnreadCount(body);
      if (count !== null) setUnreadCount(count);
    } catch {
      if (requestId === requestIdRef.current) {
        seenCursorsRef.current.delete(cursor);
        setLoadMoreError(true);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [filter, historyUrl]);

  const markRead = useCallback(
    async (notification: NotificationRow) => {
      if (notification.isRead || markingIdsRef.current.has(notification.id)) return;
      markingIdsRef.current.add(notification.id);
      setMarkingIds(new Set(markingIdsRef.current));
      setActionError(false);

      // The unread filter should immediately remove a row that is no longer
      // eligible. In the all view, preserve the row and only quiet its state.
      setNotifications((current) =>
        filter === 'unread'
          ? current.filter((item) => item.id !== notification.id)
          : current.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)),
      );
      setUnreadCount((count) => Math.max(0, count - 1));

      try {
        const response = await fetch(`/api/notifications/${notification.id}/read`, { method: 'POST' });
        if (!response.ok) throw new Error('mark read request failed');
        const body: unknown = await response.json();
        const count = getUnreadCount(body);
        if (count !== null) setUnreadCount(count);
      } catch {
        setActionError(true);
        setNotifications((current) => {
          if (current.some((item) => item.id === notification.id)) {
            return current.map((item) =>
              item.id === notification.id ? { ...item, isRead: false } : item,
            );
          }
          // Restore an unread-filter row without changing the order of the
          // other rows. The history API is newest-first, so compare times.
          return [...current, { ...notification, isRead: false }].sort(
            (a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id),
          );
        });
        setUnreadCount((count) => count + 1);
      } finally {
        markingIdsRef.current.delete(notification.id);
        setMarkingIds(new Set(markingIdsRef.current));
      }
    },
    [filter],
  );

  const markAll = useCallback(async () => {
    if (markingAll || markingIdsRef.current.size > 0 || unreadCount === 0) return;
    setMarkingAll(true);
    setActionError(false);
    const previous = notifications;
    const previousCount = unreadCount;
    setNotifications((current) =>
      filter === 'unread' ? [] : current.map((notification) => ({ ...notification, isRead: true })),
    );
    setUnreadCount(0);

    try {
      const response = await fetch('/api/notifications/read-all', { method: 'POST' });
      if (!response.ok) throw new Error('mark all request failed');
      const body: unknown = await response.json();
      const count = getUnreadCount(body);
      if (count !== null) setUnreadCount(count);
    } catch {
      setNotifications(previous);
      setUnreadCount(previousCount);
      setActionError(true);
    } finally {
      setMarkingAll(false);
    }
  }, [filter, markingAll, notifications, unreadCount]);

  const setActiveFilter = (nextFilter: Filter) => {
    if (nextFilter !== filter) setFilter(nextFilter);
  };

  const busy = loading || loadingMore;
  const showEmpty = !loading && !error && notifications.length === 0 && !hasMore;
  const showFeed = !loading && !error && (notifications.length > 0 || hasMore);

  return (
    <div className="mx-auto max-w-4xl pt-4 sm:pt-6">
      <section className="card relative overflow-hidden rounded-xl px-5 py-6 sm:px-7 sm:py-7">
        <div aria-hidden className="absolute right-0 top-0 h-24 w-36 bg-gradient-to-bl from-brand-500/15 to-transparent" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">Activity inbox</p>
            <h1 className="mt-4 text-3xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-5xl">
              Notifications
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">
              Stay updated with activity on VibeBin.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void markAll()}
            disabled={markingAll || markingIds.size > 0 || unreadCount === 0 || !!error}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] px-3.5 py-2.5 text-xs font-black uppercase tracking-[0.12em] text-zinc-300 transition-colors hover:border-brand-400/60 hover:bg-brand-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 sm:px-4"
          >
            <span aria-hidden className="text-brand-300">{markingAll ? '…' : '✓'}</span>
            {markingAll ? 'Marking read' : 'Mark all read'}
          </button>
        </div>
      </section>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="inline-flex w-full rounded-md border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-inset)] p-1 sm:w-auto"
          role="tablist"
          aria-label="Notification filter"
        >
          {(['all', 'unread'] as const).map((option) => {
            const active = filter === option;
            return (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveFilter(option)}
                className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-sm px-5 py-2 text-xs font-black uppercase tracking-[0.16em] transition-colors sm:flex-none ${
                  active
                    ? 'bg-brand-500 text-white shadow-[3px_3px_0_0_var(--vb-ink)]'
                    : 'text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-200'
                }`}
              >
                {option === 'all' ? 'All' : 'Unread'}
                {option === 'unread' && unreadCount > 0 && (
                  <span className="grid min-w-5 place-items-center rounded-sm border border-white/20 bg-white/10 px-1 py-0.5 font-mono text-[10px] leading-none text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">
          {filter === 'unread' ? 'Unread activity' : 'Your activity'}
          {unreadCount > 0 ? ` · ${unreadCount} unread` : ''}
        </p>
      </div>

      <div className="mt-4" aria-live="polite">
        {actionError && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-400/30 bg-amber-400/[0.08] px-3.5 py-3 text-sm text-amber-200">
            <span>Couldn&apos;t update that notification. Try again.</span>
            <button
              type="button"
              onClick={() => setActionError(false)}
              className="min-h-11 px-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <SkeletonRows />
        ) : error ? (
          <ErrorState signedOut={error === 'signed-out'} onRetry={() => void loadFirstPage(filter)} />
        ) : showEmpty ? (
          <EmptyState filter={filter} />
        ) : showFeed ? (
          <>
            <ul className="space-y-3" aria-label={`${filter === 'unread' ? 'Unread ' : ''}notifications`}>
              {notifications.length === 0 && hasMore && (
                <li className="card rounded-lg px-4 py-5 text-center text-sm text-zinc-400 sm:px-5">
                  More notifications are waiting below.
                </li>
              )}
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  variant="center"
                  onActivate={(item) => void markRead(item)}
                  onMarkRead={(item) => void markRead(item)}
                  busy={markingIds.has(notification.id)}
                />
              ))}
            </ul>

            <div className="mt-5 flex flex-col items-center gap-3">
              {hasMore && (
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={busy}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-md border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] px-5 py-2.5 text-xs font-black uppercase tracking-[0.16em] text-zinc-300 transition-colors hover:border-brand-400/60 hover:bg-brand-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {loadingMore ? 'Loading more…' : 'Load more'}
                </button>
              )}
              {loadMoreError && (
                <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-zinc-500">
                  <span>Couldn&apos;t load more notifications.</span>
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    className="min-h-11 px-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-300 hover:text-brand-200"
                  >
                    Try again
                  </button>
                </div>
              )}
              {!hasMore && !loadMoreError && notifications.length > 0 && (
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-700">
                  End of notification history
                </p>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
