// ------------------------------------------------------------------
// Shared paste size limits — the explicit contract between the editor
// and the paste creation endpoint.
//
// POST /api/pastes is the FINAL authority: it rejects content beyond
// this limit with 413 and never stores it. The editor mirrors the same
// number so the canvas never presents itself as unlimited: the live
// line counter measures against this limit, oversize pastes are
// rejected up front (never silently truncated), and submission is
// blocked while over the limit — with the server's own check remaining
// the backstop for every other client.
//
// Why this number:
// - 20,000 lines: the editor renders one contentEditable per line and
//   the viewer renders line-by-line, so a paste of hundreds of
//   thousands of one-character lines would create a pathological
//   document. 20,000 lines keeps both surfaces responsive and is far
//   above typical paste sizes.
// - No application-level character limit: any character count is
//   accepted as long as the line count is within the limit, subject
//   only to normal runtime/request/database constraints.
// ------------------------------------------------------------------

import type { RichDoc } from '@/lib/pasteFormat';

export const PASTE_MAX_LINES = 20_000;

export type PasteTotals = { chars: number; lines: number };

/** Total characters (summed across lines) and line count of a RichDoc. */
export function richDocTotals(doc: RichDoc): PasteTotals {
  let chars = 0;
  for (const line of doc.lines) chars += line.text?.length ?? 0;
  return { chars, lines: doc.lines.length };
}

/** The first limit a doc exceeds, or null when it fits. Only line limit remains. */
export function richDocLimitExceeded(doc: RichDoc): 'lines' | null {
  const totals = richDocTotals(doc);
  if (totals.lines > PASTE_MAX_LINES) return 'lines';
  return null;
}

/** The single, shared "too large" message the editor and server both use. */
export function pasteTooLargeMessage(limit: 'lines'): string {
  return `Paste is too large (${PASTE_MAX_LINES.toLocaleString('en-US')} lines max).`;
}
