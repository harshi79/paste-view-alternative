'use client';

import { useEffect, useRef, useState } from 'react';
import { isStickerToken } from '@/lib/statusEmoji';
import { loadStickerPack, findSticker, type StickerEntry } from '@/lib/stickerPack';
import StickerImage from './StickerImage';
import ReactionPicker from './ReactionPicker';

export type ReactionCountEntry = { reaction: string; count: number };

type Props = {
  pasteId: string;
  /** Server-rendered counts (most used first) from the same state the GET reactions API returns. */
  initialCounts: ReactionCountEntry[];
  /** The signed-in user's own reactions at render time (empty for guests). */
  initialMine?: string[];
  /** True when there is no signed-in session — reacting redirects to /register (same convention as Bookmark/Follow). */
  guest?: boolean;
};

/**
 * Normalize an API `counts` payload into renderable chips: strings only,
 * positive integers only, one chip per distinct reaction (never duplicates
 * even if a payload were malformed).
 */
function sanitizeCounts(raw: unknown): ReactionCountEntry[] {
  if (!Array.isArray(raw)) return [];
  const byReaction = new Map<string, number>();
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const reaction = (row as { reaction?: unknown }).reaction;
    const count = Number((row as { count?: unknown }).count);
    if (typeof reaction !== 'string' || !reaction) continue;
    if (!Number.isFinite(count) || count < 1) continue;
    if (byReaction.has(reaction)) continue;
    byReaction.set(reaction, Math.floor(count));
  }
  return [...byReaction.entries()].map(([reaction, count]) => ({ reaction, count }));
}

function sanitizeMine(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is string => typeof r === 'string' && r.length > 0);
}

function SmileyGlyph({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="7.5" cy="8.5" r="1" fill="currentColor" />
      <circle cx="12.5" cy="8.5" r="1" fill="currentColor" />
      <path d="M6.75 12.2c1 1.15 5.5 1.15 6.5 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Post reactions control — a compact React button + popover and the live
 * reaction chips, rendered inside the existing post action bar. The Like
 * button and everything else in the toolbar stay exactly as they were;
 * this component only talks to the existing TODO 1 reactions API:
 *
 *   GET    /api/pastes/:id/reactions  → current counts + the user's own set
 *   POST   /api/pastes/:id/reactions  → { reaction, toggle: true }
 *
 * The page server-renders the initial state (same as likes/bookmarks); this
 * client view then re-reads the API once on mount to reconcile anything that
 * changed since, and every mutation optimistically flips the chip/count,
 * then replaces state with the authoritative counts/mine the server returns
 * alongside the write. A failed request inverts the optimistic change back
 * (no stale fake counts), and an in-flight set per reaction prevents
 * duplicate/concurrent requests for the same reaction — mirroring the
 * busy-guard quality bar of LikeButton/BookmarkButton.
 *
 * Guests can read counts but never react: clicking any reaction takes them
 * to /register with the post preserved (?next=/p/…), the exact existing
 * Bookmark/Follow convention — never a silent failure.
 */
export default function ReactionBar({ pasteId, initialCounts, initialMine, guest = false }: Props) {
  const [counts, setCounts] = useState<ReactionCountEntry[]>(() => sanitizeCounts(initialCounts));
  const [mine, setMine] = useState<string[]>(() => sanitizeMine(initialMine));
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [pack, setPack] = useState<StickerEntry[] | null>(null);

  /** Reactions with a request in flight — guards duplicate/concurrent clicks. */
  const inFlight = useRef<Set<string>>(new Set());
  /** Bumped on every local mutation so a slow mount-time GET never clobbers fresher state. */
  const revRef = useRef(0);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Pre-load the existing sticker pack through the shared client loader
  // (same as the Admin Broadcast composer), so picker tiles and sticker
  // chips resolve without any extra request.
  useEffect(() => {
    let cancelled = false;
    loadStickerPack().then((p) => {
      if (!cancelled) setPack(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch the current reaction state for the post from the existing API and
  // reconcile with the server-rendered state. Failures keep the real
  // server-rendered numbers — nothing fake is ever introduced here.
  useEffect(() => {
    const rev = revRef.current;
    let cancelled = false;
    fetch(`/api/pastes/${pasteId}/reactions`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { counts?: unknown; mine?: unknown } | null) => {
        if (cancelled || !data || revRef.current !== rev) return;
        if (Array.isArray(data.counts)) setCounts(sanitizeCounts(data.counts));
        if (Array.isArray(data.mine)) setMine(sanitizeMine(data.mine));
      })
      .catch(() => {
        /* offline/failing GET: the SSR state stays, same as no fetch at all */
      });
    return () => {
      cancelled = true;
    };
  }, [pasteId]);

  // Close the picker on outside click or Escape (keyboard a11y) — same
  // document-level pattern the broadcast composer uses.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (btnRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function sendToRegister() {
    window.location.href = `/register?next=${encodeURIComponent(`/p/${pasteId}`)}`;
  }

  /** Apply one reaction toggle to the local view (optimistic step and its inverse). */
  function applyLocal(reaction: string, makeActive: boolean) {
    setCounts((prev) => {
      const idx = prev.findIndex((c) => c.reaction === reaction);
      if (makeActive) {
        if (idx === -1) return [...prev, { reaction, count: 1 }];
        return prev.map((c, i) => (i === idx ? { ...c, count: c.count + 1 } : c));
      }
      if (idx === -1) return prev;
      const next = prev[idx].count - 1;
      if (next <= 0) return prev.filter((_, i) => i !== idx);
      return prev.map((c, i) => (i === idx ? { ...c, count: next } : c));
    });
    setMine((prev) =>
      makeActive ? (prev.includes(reaction) ? prev : [...prev, reaction]) : prev.filter((r) => r !== reaction),
    );
  }

  async function toggle(reaction: string) {
    if (guest) {
      // Guests can look, but reacting is a signed-in action — route them to
      // register with this post preserved (existing Bookmark/Follow flow).
      sendToRegister();
      return;
    }
    if (inFlight.current.has(reaction)) return; // one request per reaction at a time
    setError('');
    inFlight.current.add(reaction);
    const wasActive = mine.includes(reaction);
    const nextActive = !wasActive;
    revRef.current += 1;

    // 1. Optimistic UI: flip the chip immediately.
    applyLocal(reaction, nextActive);
    try {
      // 2. Existing reactions API, canonical value, single toggle endpoint.
      const res = await fetch(`/api/pastes/${pasteId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction, toggle: true }),
      });
      if (res.status === 401) {
        // Session expired while the page was open — undo the optimistic
        // flip and reuse the guest flow (same fallback as BookmarkButton).
        revRef.current += 1;
        applyLocal(reaction, wasActive);
        sendToRegister();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update reaction.');
      // 3. Reconcile with the server state returned alongside the write.
      revRef.current += 1;
      if (Array.isArray(data.counts)) setCounts(sanitizeCounts(data.counts));
      if (Array.isArray(data.mine)) setMine(sanitizeMine(data.mine));
    } catch (e) {
      // 4. Roll back the optimistic flip — no stale fake counts survive a failure.
      revRef.current += 1;
      applyLocal(reaction, wasActive);
      setError(e instanceof Error ? e.message : 'Could not update reaction.');
    } finally {
      inFlight.current.delete(reaction);
    }
  }

  function selectReaction(reaction: string) {
    // Pick → toggle + close (Escape / outside-click also close).
    setOpen(false);
    btnRef.current?.focus();
    void toggle(reaction);
  }

  function closePicker() {
    setOpen(false);
    btnRef.current?.focus();
  }

  const visible = counts.filter((c) => c.count > 0);

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="relative inline-flex">
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="post-reaction-picker"
          aria-label={open ? 'Close reaction picker' : 'React to this paste'}
          title="React"
          className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border-2 px-3 py-2 text-xs font-bold uppercase tracking-wide transition-all active:translate-x-px active:translate-y-px sm:min-h-0 ${
            open
              ? 'border-brand-400/70 bg-brand-500/15 text-brand-200 shadow-[2px_2px_0_0_var(--vb-ink)]'
              : 'border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] text-zinc-300 hover:border-brand-400/50 hover:text-brand-300'
          }`}
        >
          <SmileyGlyph />
          <span>React</span>
        </button>
        {open && (
          <ReactionPicker
            id="post-reaction-picker"
            panelRef={panelRef}
            pack={pack}
            mine={mine}
            onSelect={selectReaction}
            onClose={closePicker}
          />
        )}
      </span>

      {visible.map((entry) => {
        const active = mine.includes(entry.reaction);
        const sticker = isStickerToken(entry.reaction) ? findSticker(pack, entry.reaction) : null;
        return (
          <button
            key={entry.reaction}
            type="button"
            data-reaction-chip={entry.reaction}
            onClick={() => void toggle(entry.reaction)}
            aria-pressed={active}
            aria-label={
              isStickerToken(entry.reaction)
                ? `${active ? 'Remove' : 'React with'} sticker ${entry.reaction}`
                : `${active ? 'Remove' : 'React with'} ${entry.reaction}`
            }
            title={active ? 'You reacted — click to remove' : 'React'}
            className={`inline-flex min-h-10 items-center justify-center gap-1 rounded-md border-2 px-2 py-1 text-xs font-bold transition-all active:translate-x-px active:translate-y-px sm:min-h-0 ${
              active
                ? 'border-brand-400/70 bg-brand-500/15 text-brand-200 shadow-[2px_2px_0_0_var(--vb-ink)] hover:bg-brand-500/25'
                : 'border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] text-zinc-300 hover:border-brand-400/50 hover:text-brand-300'
            }`}
          >
            {isStickerToken(entry.reaction) ? (
              // Actual sticker via the existing renderer — never the raw
              // token whenever the pack can display it (StickerImage only
              // falls back to text for unknown stickers, exactly like
              // everywhere else).
              <StickerImage
                token={entry.reaction}
                fallback={sticker?.emoji ?? entry.reaction}
                url={sticker?.url ?? null}
                pack={pack}
                className="h-5 w-5 max-h-5 max-w-5 object-contain"
              />
            ) : (
              <span aria-hidden className="text-base leading-none">
                {entry.reaction}
              </span>
            )}
            <span aria-live="polite">{entry.count.toLocaleString()}</span>
          </button>
        );
      })}

      {error && (
        <span role="status" className="max-w-[12rem] text-[11px] leading-4 text-red-400">
          {error}
        </span>
      )}
    </span>
  );
}
