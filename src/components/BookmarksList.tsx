'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookmarkedPasteRow } from '@/lib/bookmarks';
import PasteCard from './PasteCard';

const PAGE_SIZE = 12;

type ListResponse = {
  bookmarks?: BookmarkedPasteRow[];
  nextCursor?: string | null;
  hasMore?: boolean;
};

function isListResponse(value: unknown): value is ListResponse {
  return typeof value === 'object' && value !== null;
}

function getRows(body: unknown): BookmarkedPasteRow[] {
  if (!isListResponse(body) || !Array.isArray(body.bookmarks)) return [];
  return body.bookmarks as BookmarkedPasteRow[];
}

function mergeUnique(current: BookmarkedPasteRow[], incoming: BookmarkedPasteRow[]): BookmarkedPasteRow[] {
  const seen = new Set(current.map((row) => row.pasteId));
  const merged = [...current];
  for (const row of incoming) {
    if (seen.has(row.pasteId)) continue;
    seen.add(row.pasteId);
    merged.push(row);
  }
  return merged;
}

function BookmarkIcon({ className = 'h-7 w-7' }: { className?: string }) {
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
      <path d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
    </svg>
  );
}

function SkeletonCards() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Loading saved posts"
      aria-busy="true"
    >
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <div key={index} className="card min-h-[160px] animate-pulse rounded-lg p-4 sm:p-5" aria-hidden>
          <div className="h-3 w-16 rounded bg-white/10" />
          <div className="mt-3 h-4 w-4/5 rounded bg-white/10" />
          <div className="mt-14 flex gap-2">
            <div className="h-5 w-16 rounded-full bg-white/[0.06]" />
            <div className="h-5 w-12 rounded-full bg-white/[0.06]" />
            <div className="h-5 w-14 rounded-full bg-white/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card animate-pop rounded-lg px-5 py-14 text-center sm:px-8 sm:py-16">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-md border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-inset)] text-brand-300 shadow-[3px_3px_0_0_var(--vb-ink)]">
        <BookmarkIcon />
      </div>
      <h2 className="mt-5 text-2xl font-black uppercase tracking-tight text-white">
        No saved posts yet.
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
        Tap <span className="font-semibold text-zinc-200">Save</span> on any paste and it will be
        waiting for you here.
      </p>
      <Link href="/paste" className="btn-primary mt-6">
        Create a paste
      </Link>
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
        {signedOut ? 'Your session ended' : "Couldn't load saved posts"}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
        {signedOut
          ? 'Sign in again to view your saved posts.'
          : 'Something went wrong while loading your saved posts. Your bookmarks are still safe.'}
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

export default function BookmarksList() {
  const [rows, setRows] = useState<BookmarkedPasteRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<'failed' | 'signed-out' | null>(null);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(() => new Set());
  const [actionError, setActionError] = useState(false);

  const requestIdRef = useRef(0);
  const loadingPageRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const cursorRef = useRef<string | null>(null);
  const hasMoreRef = useRef(false);
  const seenCursorsRef = useRef<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);
  const removingIdsRef = useRef(new Set<string>());

  const listUrl = useCallback((cursor?: string | null) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursor) params.set('cursor', cursor);
    return `/api/bookmarks?${params.toString()}`;
  }, []);

  const loadFirstPage = useCallback(async () => {
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
    setRows([]);
    setHasMore(false);

    try {
      const response = await fetch(listUrl(), { signal: controller.signal });
      if (response.status === 401) {
        if (requestId === requestIdRef.current) setError('signed-out');
        return;
      }
      if (!response.ok) throw new Error('bookmarks request failed');
      const body: unknown = await response.json();
      if (requestId !== requestIdRef.current) return;

      const page = getRows(body);
      const cursor = isListResponse(body) && typeof body.nextCursor === 'string' ? body.nextCursor : null;
      const more = Boolean(isListResponse(body) && body.hasMore && cursor);
      setRows(page);
      setHasMore(more);
      cursorRef.current = cursor;
      hasMoreRef.current = more;
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      if (requestId === requestIdRef.current) setError('failed');
    } finally {
      if (requestId === requestIdRef.current) {
        loadingPageRef.current = false;
        setLoading(false);
      }
    }
  }, [listUrl]);

  useEffect(() => {
    void loadFirstPage();
    return () => abortRef.current?.abort();
  }, [loadFirstPage]);

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
    loadingMoreRef.current = true;
    seenCursorsRef.current.add(cursor);
    setLoadingMore(true);
    setLoadMoreError(false);

    try {
      const response = await fetch(listUrl(cursor));
      if (response.status === 401) {
        if (requestId === requestIdRef.current) setError('signed-out');
        return;
      }
      if (!response.ok) throw new Error('load more request failed');
      const body: unknown = await response.json();
      if (requestId !== requestIdRef.current) return;

      const page = getRows(body);
      const newCursor = isListResponse(body) && typeof body.nextCursor === 'string' ? body.nextCursor : null;
      const nextHasMore = Boolean(
        isListResponse(body) &&
          body.hasMore &&
          newCursor &&
          newCursor !== cursor &&
          !seenCursorsRef.current.has(newCursor),
      );
      setRows((current) => mergeUnique(current, page));
      setHasMore(nextHasMore);
      cursorRef.current = newCursor;
      hasMoreRef.current = nextHasMore;
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
  }, [listUrl]);

  const removeBookmark = useCallback(async (row: BookmarkedPasteRow) => {
    if (removingIdsRef.current.has(row.pasteId)) return;
    removingIdsRef.current.add(row.pasteId);
    setRemovingIds(new Set(removingIdsRef.current));
    setActionError(false);

    // Optimistic removal — the saved view should drop the row
    // immediately; a failed request restores it in place. Deduped by id,
    // so a restored row can never become a stale duplicate.
    setRows((current) => current.filter((item) => item.pasteId !== row.pasteId));

    try {
      const response = await fetch(`/api/pastes/${row.pasteId}/bookmark`, { method: 'DELETE' });
      if (!response.ok) throw new Error('remove bookmark request failed');
    } catch {
      setActionError(true);
      setRows((current) => {
        if (current.some((item) => item.pasteId === row.pasteId)) return current;
        // Restore without changing the order of the other rows: the feed
        // is most-recently-saved first, so compare save times.
        return [...current, row].sort((a, b) => b.savedAt - a.savedAt || b.pasteId.localeCompare(a.pasteId));
      });
    } finally {
      removingIdsRef.current.delete(row.pasteId);
      setRemovingIds(new Set(removingIdsRef.current));
    }
  }, []);

  const busy = loading || loadingMore;
  const showEmpty = !loading && !error && rows.length === 0 && !hasMore;
  const showFeed = !loading && !error && (rows.length > 0 || hasMore);

  return (
    <div className="pt-4 sm:pt-6">
      <section className="card animate-fade-up relative overflow-hidden rounded-xl px-5 py-6 sm:px-7 sm:py-7">
        <div aria-hidden className="absolute right-0 top-0 h-24 w-36 bg-gradient-to-bl from-brand-500/15 to-transparent" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="eyebrow">Your library</p>
            <h1 className="mt-4 text-3xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-5xl">
              Saved posts
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">
              Every paste you bookmarked, most recently saved first. Open one to read it again or
              remove it from your list.
            </p>
          </div>
          <Link href="/paste" className="btn-primary shrink-0">
            Create paste
          </Link>
        </div>
      </section>

      <div className="mt-5" aria-live="polite">
        {actionError && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-400/30 bg-amber-400/[0.08] px-3.5 py-3 text-sm text-amber-200">
            <span>Couldn&apos;t remove that bookmark. Try again.</span>
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
          <SkeletonCards />
        ) : error ? (
          <ErrorState signedOut={error === 'signed-out'} onRetry={() => void loadFirstPage()} />
        ) : showEmpty ? (
          <EmptyState />
        ) : showFeed ? (
          <>
            <ul
              className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3"
              aria-label="Saved posts"
            >
              {rows.map((row) => (
                <li key={row.pasteId}>
                  <PasteCard
                    paste={{
                      id: row.pasteId,
                      title: row.title,
                      titleColor: row.titleColor,
                      language: row.language,
                      views: row.views,
                      likesCount: row.likesCount,
                      createdAt: new Date(row.createdAt),
                      pinned: row.pinned,
                      author: row.author,
                    }}
                  />
                  <div className="mt-2 flex items-center justify-between gap-2 px-1">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">
                      Saved {new Date(row.savedAt).toLocaleDateString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeBookmark(row)}
                      disabled={removingIds.has(row.pasteId)}
                      aria-label={`Remove bookmark for ${row.title}`}
                      title="Remove from saved posts"
                      className="btn-ghost !rounded-md !px-3 !py-1.5 text-[11px] font-bold uppercase tracking-wide hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-wait disabled:opacity-60"
                    >
                      {removingIds.has(row.pasteId) ? 'Removing…' : 'Remove'}
                    </button>
                  </div>
                </li>
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
                  <span>Couldn&apos;t load more saved posts.</span>
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    className="min-h-11 px-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-brand-300 hover:text-brand-200"
                  >
                    Try again
                  </button>
                </div>
              )}
              {!hasMore && !loadMoreError && rows.length > 0 && (
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-700">
                  End of saved posts
                </p>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
