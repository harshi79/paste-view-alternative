'use client';

import StickerImage from './StickerImage';
import type { StickerEntry } from '@/lib/stickerPack';

/**
 * The compact standard-reaction row every post picker offers before the
 * custom sticker section. All are single-emoji graphemes the existing
 * reactions API accepts on shape alone (see `normalizeReactionInput`).
 */
export const STANDARD_REACTIONS: readonly string[] = ['❤️', '🔥', '😂', '😮', '😢', '💀', '👀'];

type Props = {
  /** Called with the canonical reaction value (emoji, or `:token:`). */
  onSelect: (reaction: string) => void;
  /** Closes the picker (Escape / outside click / explicit close). */
  onClose: () => void;
  /**
   * Existing sticker pack (shared client loader cache). `null` means "not
   * loaded yet"; an empty array renders the empty state — same contract
   * the Admin Broadcast composer passes to StickerPicker.
   */
  pack: StickerEntry[] | null;
  /** The current user's reactions — options in this set show as selected. */
  mine: string[];
  /** Lets the parent wire outside-click / Escape detection. */
  panelRef?: React.Ref<HTMLDivElement>;
  id?: string;
};

const SECTION_LABEL =
  'font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400';

/**
 * Compact reaction popover for a post.
 *
 * Deliberately built on the SAME infrastructure as the Admin Broadcast
 * sticker picker (without touching it): the sticker data comes from the
 * existing `/api/stickers` pack loader the composer already uses, tiles are
 * previewed with the existing `StickerImage` renderer, clicking a tile
 * reports the SAME canonical `:token:` shortcode the reactions API stores,
 * and the panel/grid styling mirrors the broadcast picker's conventions
 * (card popover, 4-up mobile / 6-up desktop grid, ≥44px touch targets,
 * scrollable, viewport-bounded width).
 *
 * Unlike the broadcast picker there is no text field to insert into:
 * a click selects/toggles the reaction itself and closes the popover.
 */
export default function ReactionPicker({
  onSelect,
  onClose,
  pack,
  mine,
  panelRef,
  id = 'post-reaction-picker',
}: Props) {
  const items = pack ?? [];

  return (
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      aria-label="Reaction picker"
      className="card animate-pop absolute right-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-lg p-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className={SECTION_LABEL}>Reactions</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close reaction picker"
          className="btn-ghost !px-2.5 !py-1 text-[11px]"
        >
          Close
        </button>
      </div>

      {/* Standard reactions — click to add/toggle, no typing, no codes. */}
      <div className="flex flex-wrap gap-1.5">
        {STANDARD_REACTIONS.map((reaction) => {
          const active = mine.includes(reaction);
          return (
            <button
              key={reaction}
              type="button"
              data-reaction-option={reaction}
              aria-pressed={active}
              aria-label={`React with ${reaction}`}
              title={active ? 'Remove reaction' : 'React'}
              onClick={() => onSelect(reaction)}
              className={`flex h-11 w-11 min-h-[44px] items-center justify-center rounded-md border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                active
                  ? 'border-brand-400/70 bg-brand-500/15 shadow-[2px_2px_0_0_var(--vb-ink)] hover:bg-brand-500/25'
                  : 'border-[color:var(--vb-line-soft)] bg-[color:var(--vb-inset)] hover:border-brand-400/60 hover:bg-[#14141e]'
              }`}
            >
              <span className="text-xl leading-none">{reaction}</span>
            </button>
          );
        })}
      </div>

      {/* Custom section — the existing sticker pack, same tiles/preview as
          the Admin Broadcast picker, selected by click. */}
      <p className={`${SECTION_LABEL} mb-2 mt-3`}>Custom</p>
      <div className="max-h-64 overflow-y-auto overscroll-contain">
        {!pack && <p className="py-8 text-center text-sm text-zinc-500">Loading stickers…</p>}
        {pack && pack.length === 0 && (
          <p className="py-8 text-center text-sm text-zinc-400">No stickers available</p>
        )}
        {items.length > 0 && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {items.map((s) => {
              const active = mine.includes(s.token);
              return (
                <button
                  key={s.token}
                  type="button"
                  data-sticker-token={s.token}
                  data-reaction-option={s.token}
                  aria-pressed={active}
                  aria-label={`React with ${s.token}${s.label ? ` (${s.label})` : ''}`}
                  title={`${s.token}${s.label ? ` — ${s.label}` : ''}`}
                  onClick={() => onSelect(s.token)}
                  className={`flex aspect-square min-h-[44px] items-center justify-center overflow-hidden rounded-md border-2 p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                    active
                      ? 'border-brand-400/70 bg-brand-500/15 shadow-[2px_2px_0_0_var(--vb-ink)] hover:bg-brand-500/25'
                      : 'border-[color:var(--vb-line-soft)] bg-[color:var(--vb-inset)] hover:border-brand-400/60 hover:bg-[#14141e]'
                  }`}
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
              );
            })}
          </div>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-4 text-zinc-500">
        Click to react — click an active reaction again to remove it.
      </p>
    </div>
  );
}
