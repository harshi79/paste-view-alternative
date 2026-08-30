// ------------------------------------------------------------------
// Pure editor line operations (the composer's split/join).
//
// The rich composer renders each line as its own uncontrolled
// contentEditable. Enter splits the active line; Backspace at the start
// of a line must join it with the previous line (the browser cannot join
// across separate contentEditables on its own). Both transforms are pure
// doc → doc functions so the exact behavior is unit-testable in Node
// without a DOM. Each new line gets a fresh stable `_key` from the
// caller so React mounts a new node that re-seeds its text via the ref
// (see Editor.tsx).
// ------------------------------------------------------------------

import type { RichDoc, RichLine } from '@/lib/pasteFormat';

/** Allocates a fresh stable key for a newly created line. */
export type NewLineKey = () => string;

/**
 * Splits line `i` at character offset `at` into two lines.
 *
 * The left half keeps the full formatting of the original line; the right
 * half keeps font/size/color. Both halves share the line's `stickerUrls`
 * map (shallow copy) so stickers/GIFs survive the split. Marks on both
 * halves are reset to `undefined` and the caller recomputes them from the
 * two resulting texts. Returns the original doc unchanged when the split
 * is invalid (line missing or offset out of range).
 */
export function splitLineAtOffset(
  doc: RichDoc,
  i: number,
  at: number,
  newKey: NewLineKey,
): RichDoc {
  const lines = doc.lines.slice();
  const line = lines[i];
  if (!line || at < 0 || at > line.text.length) return doc;
  const stickerUrls = { ...(line.stickerUrls || {}) };
  const left: RichLine = {
    ...line,
    _key: newKey(),
    text: line.text.slice(0, at),
    marks: undefined,
    stickerUrls,
  };
  const right: RichLine = {
    _key: newKey(),
    text: line.text.slice(at),
    font: line.font,
    size: line.size,
    color: line.color,
    stickerUrls,
  };
  lines.splice(i, 1, left, right);
  return { ...doc, lines };
}

/**
 * Joins line `i` into the previous line `i-1` — the transform behind a
 * Backspace at the start of a line.
 *
 * The merged line keeps the formatting (font/size/color) of the upper
 * (previous) line, the natural editor result, and merges both lines'
 * `stickerUrls` maps so stickers/GIFs on either side are preserved. Marks
 * are reset to `undefined`; the caller recomputes them from the merged
 * text (links/emoji are derived marks and survive the recompute).
 *
 * Empty lines are handled naturally: joining an empty line into its
 * predecessor simply removes it. The first line (nothing to join with) and
 * out-of-range indexes return the doc unchanged.
 */
export function mergeLineIntoPrevious(
  doc: RichDoc,
  i: number,
  newKey: NewLineKey,
): RichDoc {
  const lines = doc.lines.slice();
  if (i <= 0 || i >= lines.length) return doc;
  const prev = lines[i - 1];
  const cur = lines[i];
  if (!prev || !cur) return doc;
  const merged: RichLine = {
    _key: newKey(),
    text: prev.text + cur.text,
    font: prev.font,
    size: prev.size,
    color: prev.color,
    stickerUrls: { ...(prev.stickerUrls || {}), ...(cur.stickerUrls || {}) },
  };
  lines.splice(i - 1, 2, merged);
  return { ...doc, lines };
}

/** Result of a multi-line paste onto a single line. */
export type PasteResult = {
  /** The replacement lines for the pasted-into line (length ≥ 2). */
  lines: RichLine[];
  /** Where the caret should land in the last line (end of last pasted line). */
  caretInLastLine: number;
};

/**
 * Computes the lines produced by pasting `pastedText` into `line` at caret
 * offset `at`.
 *
 * The pasted text is split on `\n` into a sequence of editor lines rather
 * than embedded as literal newlines in one line. The first pasted line is
 * prepended to the existing prefix (before the caret), the last pasted line
 * is appended to the existing suffix (after the caret), and any middle lines
 * become new standalone lines. Every resulting line carries the original
 * line's formatting (font/size/color) and its `stickerUrls` map so a paste
 * into a mono/rich line stays consistent and stickers/GIFs survive; marks
 * are reset for the caller to recompute.
 *
 * Returns null for single-line pastes (no `\n`) — those are left to the
 * browser's default contentEditable paste. Leading/trailing newlines are
 * preserved: they produce leading/trailing (empty) lines, matching the
 * editor's Enter-split behavior. No artificial paste-size limit is applied.
 */
export function applyMultiLinePaste(
  line: RichLine,
  at: number,
  pastedText: string,
  newKey: NewLineKey,
): PasteResult | null {
  if (!pastedText.includes('\n')) return null;
  const prefix = line.text.slice(0, at);
  const suffix = line.text.slice(at);
  const parts = pastedText.split('\n');
  const stickerUrls = { ...(line.stickerUrls || {}) };
  const base: Omit<RichLine, 'text'> = {
    font: line.font,
    size: line.size,
    color: line.color,
    stickerUrls,
  };
  const lines: RichLine[] = [];
  lines.push({ ...base, _key: newKey(), text: prefix + parts[0] });
  for (let k = 1; k < parts.length - 1; k++) {
    lines.push({ ...base, _key: newKey(), text: parts[k] });
  }
  lines.push({ ...base, _key: newKey(), text: parts[parts.length - 1] + suffix });
  return { lines, caretInLastLine: parts[parts.length - 1].length };
}
