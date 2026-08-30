// ------------------------------------------------------------------
// Pure editor line operations (the composer's split/join/delete).
//
// The rich composer renders each line as its own uncontrolled
// contentEditable. Enter splits the active line; Backspace at the start
// of a line must join it with the previous line; Delete/Backspace over
// a multi-line selection removes the whole range (the browser cannot
// delete or join across separate contentEditables on its own). All
// transforms are pure doc → doc functions so the exact behavior is
// unit-testable in Node without a DOM. Each new line gets a fresh
// stable `_key` from the caller so React mounts a new node that
// re-seeds its text via the ref (see Editor.tsx).
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
 * editor's Enter-split behavior. No size limit is applied here — the
 * transform never truncates; size policy lives with the editor's paste
 * guard and the server (see src/lib/pasteLimits.ts).
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

/** Result of deleting a character range across lines. */
export type DeleteRangeResult = {
  /** The full replacement lines array. */
  lines: RichLine[];
  /**
   * Index of the single line whose text was rebuilt (its marks should be
   * recomputed by the caller), or -1 when the covered block was dropped
   * entirely (nothing to recompute).
   */
  changedLine: number;
  /** Where the caret should land after the DOM updates. */
  caretLine: number;
  caretOffset: number;
};

/**
 * Deletes the character range [start, end) across the line model — the
 * transform behind Delete/Backspace over a multi-line selection.
 *
 * The range is specified in RichDoc coordinates: it starts at character
 * `aOffset` of line `aLine` and ends at character `bOffset` of line
 * `bLine`. Reversed endpoints are normalized here, so a backward drag
 * deletes exactly the same text as a forward one.
 *
 * Semantics:
 * - Same-line ranges replace the line with its remaining prefix +
 *   suffix. The line itself always survives a single-line deletion
 *   (an empty remainder is kept as an empty line) — single-line
 *   behavior is unchanged.
 * - Cross-line ranges remove every fully-covered line between start and
 *   end. The surviving prefix of the first line and suffix of the last
 *   line merge into ONE line that keeps the first line's formatting
 *   (font/size/color) and merges both lines' stickerUrls; marks are
 *   reset for the caller to recompute.
 * - When that merged remainder is empty, the whole covered block is
 *   dropped: fully selected lines disappear and the surrounding lines
 *   join naturally — EXCEPT that a doc always keeps its minimum
 *   one-line structure (select-all + delete leaves one empty line).
 * - The caret lands at the start of the deleted range: the join point of
 *   the merged line, or the start of the line that followed a dropped
 *   block (end of the previous line when deleting through the last one).
 *
 * Returns null for empty or out-of-range selections (the doc is left
 * untouched).
 */
export function deleteRange(
  doc: RichDoc,
  aLine: number,
  aOffset: number,
  bLine: number,
  bOffset: number,
  newKey: NewLineKey,
): DeleteRangeResult | null {
  const lines = doc.lines;
  const n = lines.length;
  if (n === 0) return null;
  let startLine = aLine;
  let startOffset = aOffset;
  let endLine = bLine;
  let endOffset = bOffset;
  if (endLine < startLine || (endLine === startLine && endOffset < startOffset)) {
    [startLine, startOffset, endLine, endOffset] = [endLine, endOffset, startLine, startOffset];
  }
  if (startLine < 0 || endLine >= n) return null;
  const first = lines[startLine];
  const last = lines[endLine];
  startOffset = Math.max(0, Math.min(startOffset, first.text.length));
  endOffset = Math.max(0, Math.min(endOffset, last.text.length));

  if (startLine === endLine) {
    if (startOffset >= endOffset) return null;
    const replacement: RichLine = {
      ...first,
      _key: newKey(),
      text: first.text.slice(0, startOffset) + first.text.slice(endOffset),
      marks: undefined,
    };
    const out = lines.slice();
    out.splice(startLine, 1, replacement);
    return {
      lines: out,
      changedLine: startLine,
      caretLine: startLine,
      caretOffset: startOffset,
    };
  }

  const mergedText = first.text.slice(0, startOffset) + last.text.slice(endOffset);
  const out = lines.slice();
  if (mergedText.length > 0) {
    const replacement: RichLine = {
      _key: newKey(),
      text: mergedText,
      font: first.font,
      size: first.size,
      color: first.color,
      stickerUrls: { ...(first.stickerUrls || {}), ...(last.stickerUrls || {}) },
    };
    out.splice(startLine, endLine - startLine + 1, replacement);
    return {
      lines: out,
      changedLine: startLine,
      caretLine: startLine,
      caretOffset: startOffset,
    };
  }

  // The fully-covered block collapses to nothing. Keep the minimum
  // one-line structure when the whole doc was selected.
  out.splice(startLine, endLine - startLine + 1);
  if (out.length === 0) {
    out.push({
      _key: newKey(),
      text: '',
      font: first.font,
      size: first.size,
      color: first.color,
    });
    return { lines: out, changedLine: 0, caretLine: 0, caretOffset: 0 };
  }
  const caretLine = startLine < out.length ? startLine : out.length - 1;
  const caretOffset = startLine < out.length ? 0 : (out[out.length - 1]?.text.length ?? 0);
  return { lines: out, changedLine: -1, caretLine, caretOffset };
}
