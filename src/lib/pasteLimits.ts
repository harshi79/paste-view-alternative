// ------------------------------------------------------------------
// Shared paste size limits — the explicit contract between the editor
// and the paste creation endpoint.
//
// POST /api/pastes is the FINAL authority: it rejects content beyond
// these limits with 413 and never stores it. The editor mirrors the
// same numbers so the canvas never presents itself as unlimited: live
// characters/lines counters measure against these limits, oversize
// pastes are rejected up front (never silently truncated), and
// submission is blocked while over a limit — with the server's own
// check remaining the backstop for every other client.
//
// Why these numbers:
// - 100,000 characters: the long-standing server-side protection for
//   paste bodies. Kept as-is — it bounds storage, transport and render
//   cost while staying generous for a paste product.
// - 2,000 lines: the character limit alone does not bound document
//   shape. The editor renders one contentEditable per line and the
//   viewer renders line-by-line, so a paste of tens of thousands of
//   one-character lines would sail under the character limit while
//   creating a pathological document. 2,000 lines keeps both surfaces
//   responsive and is far above typical paste sizes.
// ------------------------------------------------------------------

import type { RichDoc } from '@/lib/pasteFormat';

export const PASTE_MAX_CHARS = 100_000;
export const PASTE_MAX_LINES = 2_000;

export type PasteTotals = { chars: number; lines: number };

/** Total characters (summed across lines) and line count of a RichDoc. */
export function richDocTotals(doc: RichDoc): PasteTotals {
  let chars = 0;
  for (const line of doc.lines) chars += line.text?.length ?? 0;
  return { chars, lines: doc.lines.length };
}

/** The first limit a doc exceeds, or null when it fits both. */
export function richDocLimitExceeded(doc: RichDoc): 'chars' | 'lines' | null {
  const totals = richDocTotals(doc);
  if (totals.chars > PASTE_MAX_CHARS) return 'chars';
  if (totals.lines > PASTE_MAX_LINES) return 'lines';
  return null;
}

/** The single, shared "too large" message the editor and server both use. */
export function pasteTooLargeMessage(limit: 'chars' | 'lines'): string {
  return limit === 'chars'
    ? `Paste is too large (${PASTE_MAX_CHARS.toLocaleString('en-US')} characters max).`
    : `Paste is too large (${PASTE_MAX_LINES.toLocaleString('en-US')} lines max).`;
}
