'use client';

import { useEffect, useRef, useState } from 'react';
import StickerImage from './StickerImage';
import type { StickerEntry } from '@/lib/stickerPack';

type Status = 'loading' | 'ready' | 'empty' | 'error';

type Props = {
  /** Called with the sticker's existing token (e.g. `:wave:`) to insert. */
  onSelect: (token: string) => void;
  /** Closes the picker (Escape / outside click / explicit close). */
  onClose: () => void;
  /**
   * Pre-loaded pack from the composer (shared client loader cache). When
   * provided it is used directly so the picker never re-fetches the same
   * `/api/stickers` data the live preview already loaded.
   */
  pack?: StickerEntry[] | null;
  /** Lets the parent wire outside-click / Escape detection. */
  panelRef?: React.Ref<HTMLDivElement>;
  id?: string;
};

/**
 * Compact sticker picker for the Admin Broadcast composer.
 *
 * Reuses the EXISTING sticker system end-to-end:
 *   - the real sticker data comes from the same `/api/stickers` endpoint the
 *     rest of VibeBin uses (via the composer's already-loaded `pack`, or a
 *     single fetch when opened without one);
 *   - each sticker is previewed with the existing `StickerImage` renderer,
 *     so pack GIFs, emoji fallbacks and raw tokens all look exactly like
 *     they do everywhere else;
 *   - clicking a sticker inserts the SAME `:token:` shortcode the broadcast
 *     preview already understands — no second sticker syntax is invented.
 */
export default function StickerPicker({
  onSelect,
  onClose,
  pack,
  panelRef,
  id = 'broadcast-sticker-picker',
}: Props) {
  const [items, setItems] = useState<StickerEntry[]>(pack ?? []);
  const [status, setStatus] = useState<Status>(
    pack ? (pack.length ? 'ready' : 'empty') : 'loading',
  );
  const fetchedRef = useRef(false);

  useEffect(() => {
    // A pack was provided (the composer always passes its already-loaded,
    // cache-shared pack, including an empty array) — trust it directly and
    // never re-fetch the data the live preview already loaded. `null`/
    // `undefined` means "not loaded yet" (standalone use, or the composer
    // opened the picker before its pack finished loading) — fall through to
    // a single fetch from the existing /api/stickers endpoint with distinct
    // empty vs error handling.
    if (pack) {
      setItems(pack);
      setStatus(pack.length ? 'ready' : 'empty');
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    let cancelled = false;
    fetch('/api/stickers')
      .then((res) => {
        if (!res.ok) throw new Error('sticker fetch failed');
        return res.json();
      })
      .then((data: { stickers?: unknown }) => {
        if (cancelled) return;
        const stickers = Array.isArray(data.stickers) ? (data.stickers as StickerEntry[]) : [];
        setItems(stickers);
        setStatus(stickers.length ? 'ready' : 'empty');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [pack]);

  return (
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label="Sticker picker"
      className="card animate-pop absolute left-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-lg p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">
          Stickers
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sticker picker"
          className="btn-ghost !px-2.5 !py-1 text-[11px]"
        >
          Close
        </button>
      </div>
      <p className="mb-3 text-xs text-zinc-500">
        Click a sticker to drop its <code className="font-mono text-zinc-300">:token:</code> into
        your message at the cursor.
      </p>

      <div className="max-h-64 overflow-y-auto overscroll-contain">
        {status === 'loading' && (
          <p className="py-8 text-center text-sm text-zinc-500">Loading stickers…</p>
        )}
        {status === 'error' && (
          <p className="py-8 text-center text-sm text-zinc-400">
            Couldn’t load stickers right now.
          </p>
        )}
        {status === 'empty' && (
          <p className="py-8 text-center text-sm text-zinc-400">No stickers available</p>
        )}
        {status === 'ready' && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {items.map((s) => (
              <button
                key={s.token}
                type="button"
                data-sticker-token={s.token}
                aria-label={`Insert sticker ${s.token}${s.label ? ` (${s.label})` : ''}`}
                title={`${s.token}${s.label ? ` — ${s.label}` : ''}`}
                onClick={() => onSelect(s.token)}
                className="flex aspect-square min-h-[44px] items-center justify-center overflow-hidden rounded-md border-2 border-[color:var(--vb-line-soft)] bg-[color:var(--vb-inset)] p-1 transition-colors hover:border-brand-400/60 hover:bg-[#14141e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                <span className="flex h-9 w-9 items-center justify-center text-2xl">
                  <StickerImage
                    token={s.token}
                    fallback={s.emoji ?? s.token}
                    url={s.url}
                    pack={items}
                    className="h-9 w-9 max-h-9 max-w-9 object-contain"
                  />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
