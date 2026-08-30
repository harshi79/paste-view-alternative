/**
 * Regression tests — DOM-selection interpretation for cross-line delete.
 *
 * The composer renders each RichDoc line as its own contentEditable
 * <div>. Before a multi-line selection can drive `deleteRange`, the
 * browser's selection endpoints (anchorNode/anchorOffset and
 * focusNode/focusOffset) must be mapped to (line index, character
 * offset) pairs in RichDoc coordinates.
 *
 * The helpers in src/lib/editorSelection.ts read only the structural
 * shape of DOM nodes (nodeType / data / childNodes / parentNode), so
 * they are exercised here against plain object trees that mirror the
 * real line DOM: one <div> per line containing a single text node (or
 * nothing for an empty line).
 *
 * The last describe block ties the two modules together end to end:
 * a selection interpreted from DOM endpoints is fed to `deleteRange`.
 */
import { describe, expect, it } from 'vitest';

import {
  offsetWithinRoot,
  orderedRange,
  resolveLinePosition,
  type SelNode,
} from '@/lib/editorSelection';
import { deleteRange } from '@/lib/editorLineOps';

/** Builds a node shaped like a DOM Text (nodeType 3). */
function t(data: string): SelNode {
  return { nodeType: 3, data, parentNode: null };
}

/** Builds a node shaped like a line <div> (nodeType 1). */
function el(...kids: (SelNode | null)[]): SelNode {
  const node: SelNode = { nodeType: 1, childNodes: kids };
  for (const kid of kids) if (kid) kid.parentNode = node;
  return node;
}

describe('offsetWithinRoot', () => {
  const root = el(t('ab'), t('cd'));

  it('maps text-node endpoints to character offsets', () => {
    expect(offsetWithinRoot(root, root.childNodes![0]!, 1)).toBe(1);
    expect(offsetWithinRoot(root, root.childNodes![1]!, 2)).toBe(4);
  });

  it('maps element-boundary endpoints (child index) to character offsets', () => {
    expect(offsetWithinRoot(root, root, 0)).toBe(0);
    expect(offsetWithinRoot(root, root, 1)).toBe(2);
    expect(offsetWithinRoot(root, root, 2)).toBe(4);
  });

  it('handles empty lines and clamps oversized offsets', () => {
    const empty = el();
    expect(offsetWithinRoot(empty, empty, 0)).toBe(0);
    const single = el(t('abc'));
    expect(offsetWithinRoot(single, single, 9)).toBe(3);
  });

  it('returns 0 for endpoints outside the root (defensive)', () => {
    expect(offsetWithinRoot(root, t('x'), 0)).toBe(0);
  });
});

describe('resolveLinePosition', () => {
  const line0 = el(t('hello'));
  const line1 = el(t('world'));
  const lines = [line0, line1] as const;

  it('resolves a text node inside a line to (line, offset)', () => {
    expect(resolveLinePosition(lines, line1.childNodes![0]!, 2)).toEqual({ line: 1, offset: 2 });
  });

  it('resolves the line element itself via child-index offsets', () => {
    // Selection point at the element boundary after the line's single
    // text node: child index 1 → the full 5 characters.
    expect(resolveLinePosition(lines, line0, 1)).toEqual({ line: 0, offset: 5 });
    expect(resolveLinePosition(lines, line0, 0)).toEqual({ line: 0, offset: 0 });
  });

  it('resolves empty lines at offset 0', () => {
    const empty = el();
    expect(resolveLinePosition([empty], empty, 0)).toEqual({ line: 0, offset: 0 });
  });

  it('returns null for endpoints outside the editor lines', () => {
    expect(resolveLinePosition(lines, t('x'), 0)).toBeNull();
    expect(resolveLinePosition(lines, null, 0)).toBeNull();
    // A detached element whose ancestors never include a line element.
    expect(resolveLinePosition(lines, el(t('nope')), 1)).toBeNull();
  });
});

describe('orderedRange', () => {
  it('keeps forward selections as-is and flips reversed ones', () => {
    expect(orderedRange({ line: 0, offset: 5 }, { line: 1, offset: 5 })).toEqual({
      start: { line: 0, offset: 5 },
      end: { line: 1, offset: 5 },
    });
    expect(orderedRange({ line: 1, offset: 5 }, { line: 0, offset: 5 })).toEqual({
      start: { line: 0, offset: 5 },
      end: { line: 1, offset: 5 },
    });
    expect(orderedRange({ line: 0, offset: 5 }, { line: 0, offset: 2 })).toEqual({
      start: { line: 0, offset: 2 },
      end: { line: 0, offset: 5 },
    });
  });
});

describe('cross-line selection → deleteRange (end to end)', () => {
  const lines = [
    { text: 'hello world' },
    { text: 'goodbye moon' },
    { text: 'third line' },
  ];
  const lineEls = [
    el(t('hello world')),
    el(t('goodbye moon')),
    el(t('third line')),
  ];

  function applySelection(aLine: number, aOffset: number, fLine: number, fOffset: number) {
    const anchor = resolveLinePosition(lineEls, lineEls[aLine].childNodes![0]!, aOffset);
    const focus = resolveLinePosition(lineEls, lineEls[fLine].childNodes![0]!, fOffset);
    expect(anchor).not.toBeNull();
    expect(focus).not.toBeNull();
    const { start, end } = orderedRange(anchor!, focus!);
    const res = deleteRange(
      { v: 1, lines: lines.map((l) => ({ ...l })) },
      start.line,
      start.offset,
      end.line,
      end.offset,
      () => 'k',
    );
    return res!;
  }

  it('deletes from the middle of line A to the middle of line B', () => {
    const res = applySelection(0, 5, 1, 7);
    // 'hello ' prefix + ' moon' suffix join into one line.
    expect(res.lines.map((l) => l.text)).toEqual(['hello moon', 'third line']);
    expect(res.caretLine).toBe(0);
    expect(res.caretOffset).toBe(5);
  });

  it('deletes full lines when the endpoints resolve to line boundaries', () => {
    // Start of line 0 (element boundary, child index 0) to end of line 1
    // (element boundary after its text node, child index 1).
    const anchor = resolveLinePosition(lineEls, lineEls[0], 0);
    const focus = resolveLinePosition(lineEls, lineEls[1], 1);
    const { start, end } = orderedRange(anchor!, focus!);
    const res = deleteRange(
      { v: 1, lines: lines.map((l) => ({ ...l })) },
      start.line,
      start.offset,
      end.line,
      end.offset,
      () => 'k',
    );
    expect(res!.lines.map((l) => l.text)).toEqual(['third line']);
    expect(res!.caretLine).toBe(0);
    expect(res!.caretOffset).toBe(0);
  });

  it('applies a reversed selection identically', () => {
    const forward = applySelection(0, 5, 1, 7);
    const reversed = applySelection(1, 7, 0, 5);
    expect(reversed.lines.map((l) => l.text)).toEqual(forward.lines.map((l) => l.text));
    expect(reversed.caretOffset).toBe(forward.caretOffset);
  });

  it('leaves endpoints outside the editor unresolved (caller falls back)', () => {
    expect(resolveLinePosition(lineEls, t('outside'), 0)).toBeNull();
  });
});
