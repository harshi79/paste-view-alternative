'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatestPasteCard, LatestPastePage } from '@/lib/feed';
import PasteCard from './PasteCard';

const PAGE_SIZE = 12;

type ListResponse = {
  pastes?: LatestPasteCard[];
  nextCursor?: string | null;
  hasMore?: boolean;
};

function isListResponse(value: unknown): value is ListResponse {
  return typeof value === 'object' && value !== null;
}

function getRows(body: unknown): LatestPasteCard[] {
  if (!isListResponse(body) || !Array.isArray(body.pastes)) return [];
  return body.pastes;
}

function mergeUnique(current: LatestPasteCard[], incoming: LatestPasteCard[]): LatestPasteCard[] {
  const seen = new Set(current.map((row) => row.id));
  const merged = [...current];
  for (const row of incoming) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged;
}

function SkeletonCards() {
  return (
    <div className="space-y-4" aria-label="Loading latest posts" aria-busy="true">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="card min-h-[160px] animate-pulse rounded-lg p-4 sm:p-5" aria-hidden>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-white/10" />
            <div className="h-3 w-28 rounded bg-white/10" />
          </div>
          <div className="mt-4 h-4 w-4/5 rounded bg-white/10" />
          <div className="mt-3 h-12 w-full rounded bg-white/[0.06]" />
          <div className="mt-6 flex gap-2">
            <div className="h-5 w-16 rounded-full bg-white/[0.06]" />
            <div className="h-5 w-12 rounded-full bg-white/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card rounded-lg px-5 py-14 text-center sm:px-8 sm:py-16">
      <h2 className="text-2xl font-black uppercase tracking-tight text-white">No posts yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
        Public pastes will show up here as soon as someone publishes one.
      </p>
      <Link href="/paste" className="btn-primary mt-6">
        Create a paste
      </Link>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="card rounded-lg px-5 py-12 text-center sm:px-8 sm:py-14">
      <h2 className="text-xl font-black uppercase tracking-tight text-white">Couldn&apos;t load latest posts</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
        Something went wrong while loading the feed. Try again.
      </p>
      <button type="button" onClick={onRetry} className="btn-primary mt-6">
        Try again
      </button>
    </div>
  );
}

export default function LatestFeed({
  initial,
  guest = false,
}: {
  initial?: LatestPastePage | null;
  guest?: boolean;
}) {
  const [rows, setRows] = useState<LatestPasteCard[]>(initial?.pastes ?? []);
  const [hasMore, setHasMore] = useState(Boolean(initial?.hasMore && initial.nextCursor));
  const [loading, setLoading] = useState(!initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);

  const requestIdRef = useRef(0);
  const loadingPageRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const cursorRef = useRef<string | null>(initial?.nextCursor ?? null);
  const hasMoreRef = useRef(Boolean(initial?.hasMore && initial.nextCursor));
  const seenCursorsRef = useRef<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const listUrl = useCallback((cursor?: string | null) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (cursor) params.set('cursor', cursor);
    return `/api/pastes/latest?${params.toString()}`;
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
    setError(false);
    setLoadMoreError(false);
    setRows([]);
    setHasMore(false);

    try {
      const response = await fetch(listUrl(), { signal: controller.signal });
      if (!response.ok) throw new Error('latest request failed');
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
      if (requestId === requestIdRef.current) setError(true);
    } finally {
      if (requestId === requestIdRef.current) {
        loadingPageRef.current = false;
        setLoading(false);
      }
    }
  }, [listUrl]);

  useEffect(() => {
    if (initial) return;
    void loadFirstPage();
    return () => abortRef.current?.abort();
  }, [initial, loadFirstPage]);

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

  const busy = loading || loadingMore;
  const showEmpty = !loading && !error && rows.length === 0 && !hasMore;
  const showFeed = !loading && !error && (rows.length > 0 || hasMore);

  return (
    <div aria-live="polite">
      {loading ? (
        <SkeletonCards />
      ) : error ? (
        <ErrorState onRetry={() => void loadFirstPage()} />
      ) : showEmpty ? (
        <EmptyState />
      ) : showFeed ? (
        <>
          <ul className="space-y-4" aria-label="Latest posts">
            {rows.map((row) => (
              <li key={row.id}>
                <PasteCard
                  interactive
                  paste={{
                    id: row.id,
                    title: row.title,
                    titleColor: row.titleColor,
                    language: row.language,
                    views: row.views,
                    likesCount: row.likesCount,
                    createdAt: new Date(row.createdAt),
                    pinned: row.pinned,
                    expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
                    preview: row.preview,
                    author: row.author,
                    reactionCounts: row.reactionCounts,
                    mineReaction: row.mineReaction,
                    bookmarked: row.bookmarked,
                    guest,
                  }}
                />
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
                <span>Couldn&apos;t load more posts.</span>
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
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">
                End of latest posts
              </p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
