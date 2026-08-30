import type { StickerEntry } from './stickerPack';

/** Canonical persistent sticker token shared by paste and profile status. */
export const STICKER_TOKEN_RE = /^:[a-z0-9_+-]{1,32}:$/;

export type ResolvedStatusEmoji =
  | { kind: 'empty' }
  | { kind: 'unicode'; value: string }
  | { kind: 'sticker'; token: string; sticker: StickerEntry | null };

export function isStickerToken(value: string): boolean {
  return STICKER_TOKEN_RE.test(value);
}

/** Resolve a stored status without treating URLs or arbitrary strings as assets. */
export function resolveStatusEmoji(
  stored: string | null | undefined,
  pack: readonly StickerEntry[] = [],
): ResolvedStatusEmoji {
  const value = String(stored ?? '').trim();
  if (!value) return { kind: 'empty' };
  if (!isStickerToken(value)) return { kind: 'unicode', value };
  const sticker = pack.find((item) => item.token.toLowerCase() === value.toLowerCase()) ?? null;
  return { kind: 'sticker', token: value, sticker };
}

/**
 * Grapheme-aware validation for a compact Unicode emoji status.
 * A status may contain up to three emoji graphemes (including ZWJ sequences,
 * flags, keycaps and modifiers) and never gets sliced through a sequence.
 */
export function normalizeUnicodeStatus(value: string): string | null {
  const normalized = value.trim().normalize('NFC');
  if (!normalized || /[\u0000-\u001f\u007f<>]/u.test(normalized)) return null;
  if (/^(?:https?:|data:|javascript:|file:)/i.test(normalized)) return null;

  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const graphemes = Array.from(segmenter.segment(normalized), (entry) => entry.segment);
  if (graphemes.length === 0 || graphemes.length > 3) return null;

  const emojiPart = /\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u;
  if (!graphemes.every((grapheme) => emojiPart.test(grapheme))) return null;
  return normalized;
}
