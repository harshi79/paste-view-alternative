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
  /** The signed-in user's ONE reaction at render time (null for guests / no reaction). */
  initialMine?: string | null;
  /** True when there is no signed-in session — reacting redirects to /register (same convention as Bookmark/Follow). */
  guest?: boolean;
};

/**
 * Normalize an API `counts` payload into renderable chips: strings only,
 * positive integers only, one chip per distinct reaction (never duplicates
 * even if a payload were malformed). The ❤️ entry is the like count.
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

/**
 * The API's `mine` is ONE reaction value or null. Legacy/malformed array
 * payloads collapse to their first entry so exactly one can ever show.
 */
function sanitizeMine(raw: unknown): string | null {
  if (Array.isArray(raw)) return sanitizeMine(raw[0]);
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
}

function CaretGlyph() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * ONE unified reaction control for a post — there is no separate Like
 * button anymore. The ❤️ Like is simply the first/default reaction: the
 * toggle shows the user's current reaction (or ❤️ when they have none)
 * and opens the picker; the live chips beside it are the one unified
 * count set (❤️ count included — it IS the like count).
 *
 *   GET    /api/pastes/:id/reactions  → current counts + the user's `mine`
 *   POST   /api/pastes/:id/reactions  → { reaction } — select / replace
 *   DELETE /api/pastes/:id/reactions  → remove the current reaction
 *
 * A user holds EXACTLY ONE reaction per post: selecting a different
 * reaction replaces the current one, selecting the active reaction
 * removes it. The page server-renders the initial state (same as
 * bookmarks); this client view re-reads the API once on mount to
 * reconcile anything that changed since, and every mutation optimistically
 * moves the user's single reaction (decrement old, increment new), then
 * replaces state with the authoritative counts/mine the server returns
 * alongside the write. A failed request restores the exact previous
 * state (no stale fake counts), and a single in-flight guard prevents
 * concurrent requests from producing impossible states. Guests can read
 * counts but never react: clicking anything takes them to /register with
 * the post preserved (?next=/p/…), the exact existing Bookmark/Follow
 * convention — never a silent failure.
 */
export default function ReactionBar({ pasteId, initialCounts, initialMine, guest = false }: Props) {
  const [counts, setCounts] = useState<ReactionCountEntry[]>(() => sanitizeCounts(initialCounts));
  const [mine, setMine] = useState<string | null>(() => sanitizeMine(initialMine));
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [pack, setPack] = useState<StickerEntry[] | null>(null);

  /** True while a reaction request is in flight — the single concurrency guard. */
  const inFlight = useRef(false);
  /** Bumped on every local mutation so a slow mount-time GET never clobbers fresher state. */
  const revRef = useRef(0);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Pre-load the existing sticker pack through the shared client loader
  // (same as the Admin Broadcast composer), so picker tiles, the toggle's
  // current-reaction sticker and sticker chips resolve without extra requests.
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
        setMine(sanitizeMine(data.mine));
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

  /**
   * Move the user's single reaction from `from` to `to` in the local view
   * (null = no reaction): decrement the old chip, increment the new one.
   * Used for the optimistic step AND its exact inverse on rollback.
   */
  function applyLocal(from: string | null, to: string | null) {
    setCounts((prev) => {
      const next = prev.map((c) => ({ ...c }));
      const bump = (reaction: string, delta: number) => {
        const idx = next.findIndex((c) => c.reaction === reaction);
        if (idx === -1) {
          if (delta > 0) next.push({ reaction, count: delta });
          return;
        }
        next[idx] = { ...next[idx], count: next[idx].count + delta };
      };
      if (from) bump(from, -1);
      if (to && to !== from) bump(to, 1);
      return next.filter((c) => c.count > 0);
    });
    setMine(to);
  }

  /**
   * Select ONE reaction — the whole reaction contract in one place:
   * clicking the active reaction removes it, anything else replaces the
   * current reaction. Optimistic first, reconciled with the server's
   * authoritative state, rolled back exactly on failure.
   */
  async function select(reaction: string) {
    if (guest) {
      // Guests can look, but reacting is a signed-in action — route them to
      // register with this post preserved (existing Bookmark/Follow flow).
      sendToRegister();
      return;
    }
    if (inFlight.current) return; // one reaction request at a time
    const previous = mine;
    if (previous === reaction) {
      // Selecting the current reaction removes it.
      setError('');
      inFlight.current = true;
      revRef.current += 1;
      applyLocal(previous, null);
      try {
        const res = await fetch(`/api/pastes/${pasteId}/reactions`, { method: 'DELETE' });
        if (res.status === 401) {
          revRef.current += 1;
          applyLocal(null, previous);
          sendToRegister();
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not update reaction.');
        revRef.current += 1;
        if (Array.isArray(data.counts)) setCounts(sanitizeCounts(data.counts));
        setMine(sanitizeMine(data.mine));
      } catch (e) {
        revRef.current += 1;
        applyLocal(null, previous);
        setError(e instanceof Error ? e.message : 'Could not update reaction.');
      } finally {
        inFlight.current = false;
      }
      return;
    }

    // Selecting a different reaction replaces the current one.
    setError('');
    inFlight.current = true;
    revRef.current += 1;
    applyLocal(previous, reaction);
    try {
      const res = await fetch(`/api/pastes/${pasteId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction }),
      });
      if (res.status === 401) {
        // Session expired while the page was open — undo the optimistic
        // move and reuse the guest flow (same fallback as BookmarkButton).
        revRef.current += 1;
        applyLocal(reaction, previous);
        sendToRegister();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update reaction.');
      // Reconcile with the server state returned alongside the write.
      revRef.current += 1;
      if (Array.isArray(data.counts)) setCounts(sanitizeCounts(data.counts));
      setMine(sanitizeMine(data.mine));
    } catch (e) {
      // Restore the exact previous state — no stale fake counts survive.
      revRef.current += 1;
      applyLocal(reaction, previous);
      setError(e instanceof Error ? e.message : 'Could not update reaction.');
    } finally {
      inFlight.current = false;
    }
  }

  function selectReaction(reaction: string) {
    // Pick → select + close (Escape / outside-click also close).
    setOpen(false);
    btnRef.current?.focus();
    void select(reaction);
  }

  function closePicker() {
    setOpen(false);
    btnRef.current?.focus();
  }

  const visible = counts.filter((c) => c.count > 0);
  const currentSticker = mine && isStickerToken(mine) ? findSticker(pack, mine) : null;
  const active = !!mine;

  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
      {/* ONE control: current reaction (or the default ❤️) + picker caret. */}
      <span className="relative inline-flex">
        <button
          ref={btnRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="post-reaction-picker"
          aria-label={mine ? `Change reaction (current ${mine})` : 'React to this paste'}
          title={mine ? 'Change reaction' : 'React'}
          data-current-reaction={mine ?? ''}
          className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md border-2 px-2.5 py-2 text-xs font-bold uppercase tracking-wide transition-all active:translate-x-px active:translate-y-px sm:min-h-0 ${
            active
              ? 'border-brand-400/70 bg-brand-500/15 text-brand-200 shadow-[2px_2px_0_0_var(--vb-ink)] hover:bg-brand-500/25'
              : 'border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] text-zinc-300 hover:border-brand-400/50 hover:text-brand-300'
          }`}
        >
          {mine && isStickerToken(mine) ? (
            // The user's actual animated/custom sticker — never the token.
            <StickerImage
              token={mine}
              fallback={currentSticker?.emoji ?? mine}
              url={currentSticker?.url ?? null}
              pack={pack}
              className="h-5 w-5 max-h-5 max-w-5 object-contain"
            />
          ) : (
            <span aria-hidden className="text-base leading-none">
              {mine ?? '❤️'}
            </span>
          )}
          <CaretGlyph />
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
        const isActive = mine === entry.reaction;
        const sticker = isStickerToken(entry.reaction) ? findSticker(pack, entry.reaction) : null;
        return (
          <button
            key={entry.reaction}
            type="button"
            data-reaction-chip={entry.reaction}
            onClick={() => void select(entry.reaction)}
            aria-pressed={isActive}
            aria-label={
              isStickerToken(entry.reaction)
                ? `${isActive ? 'Remove' : 'React with'} sticker ${entry.reaction}`
                : `${isActive ? 'Remove' : 'React with'} ${entry.reaction}`
            }
            title={isActive ? 'You reacted — click to remove' : 'React'}
            className={`inline-flex min-h-10 items-center justify-center gap-1 rounded-md border-2 px-2 py-1 text-xs font-bold transition-all active:translate-x-px active:translate-y-px sm:min-h-0 ${
              isActive
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
