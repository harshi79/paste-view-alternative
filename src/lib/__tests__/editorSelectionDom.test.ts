// @vitest-environment jsdom
/**
 * Regression tests — DOM-selection interpretation against a real DOM
 * (change #1).
 *
 * The composer renders each RichDoc line as its own contentEditable <div>.
 * Before a multi-line selection can drive `deleteRange`, the browser's
 * selection endpoints (anchorNode/anchorOffset, focusNode/focusOffset) must
 * be mapped to (line, offset) coordinates — including empty lines (whose
 * DOM is a single <br>) and element-boundary endpoints (a full-line
 * selection). These tests build a real DOM tree and drive a real
 * `Selection`/`Range`, then run the exact interpretation the editor uses,
 * rather than testing only the pure transform against plain-object trees.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  offsetWithinRoot,
  orderedRange,
  resolveLinePosition,
  type SelNode,
} from '@/lib/editorSelection';
import { deleteRange } from '@/lib/editorLineOps';

/** Cast a real DOM node to the structural `SelNode` subset the helpers read. */
const selNode = (n: Node | null): SelNode | null => n as unknown as SelNode | null;
const selLines = (els: HTMLElement[]): readonly (SelNode | null)[] =>
  els as unknown as readonly (SelNode | null)[];

function makeEditor() {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const line0 = document.createElement('div');
  line0.contentEditable = 'true';
  line0.appendChild(document.createTextNode('hello world'));

  const line1 = document.createElement('div');
  line1.contentEditable = 'true';
  line1.appendChild(document.createElement('br')); // empty line

  const line2 = document.createElement('div');
  line2.contentEditable = 'true';
  line2.appendChild(document.createTextNode('third line'));

  container.append(line0, line1, line2);
  return { container, lines: [line0, line1, line2] };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('resolveLinePosition / offsetWithinRoot — real DOM endpoints', () => {
  it('maps a text-node endpoint to (line, offset)', () => {
    const { lines } = makeEditor();
    expect(resolveLinePosition(selLines(lines), selNode(lines[0].firstChild), 5)).toEqual({
      line: 0,
      offset: 5,
    });
  });

  it('maps an empty-line <br> endpoint to offset 0', () => {
    const { lines } = makeEditor();
    expect(resolveLinePosition(selLines(lines), selNode(lines[1].firstChild), 0)).toEqual({
      line: 1,
      offset: 0,
    });
  });

  it('maps an element-boundary endpoint (child index) to a character offset', () => {
    const { lines } = makeEditor();
    // line0 has one child (its 11-char text node): child index 1 → offset 11.
    expect(resolveLinePosition(selLines(lines), selNode(lines[0]), 1)).toEqual({
      line: 0,
      offset: 11,
    });
    expect(resolveLinePosition(selLines(lines), selNode(lines[0]), 0)).toEqual({
      line: 0,
      offset: 0,
    });
  });

  it('returns null for endpoints outside the editor lines', () => {
    const { lines } = makeEditor();
    const stray = document.createTextNode('x');
    expect(resolveLinePosition(selLines(lines), selNode(stray), 0)).toBeNull();
    expect(resolveLinePosition(selLines(lines), null, 0)).toBeNull();
  });

  it('offsetWithinRoot counts preceding text across children', () => {
    const { lines } = makeEditor();
    const root = selNode(lines[0])!;
    const text = selNode(lines[0].firstChild)!;
    expect(offsetWithinRoot(root, text, 3)).toBe(3);
  });
});

describe('cross-line Selection → deleteRange (end to end, real DOM)', () => {
  function select(
    lines: HTMLElement[],
    base: { line: number; offset: number },
    extent: { line: number; offset: number },
  ) {
    const sel = window.getSelection()!;
    const baseNode = lines[base.line].firstChild!;
    const extentNode = lines[extent.line].firstChild!;
    sel.removeAllRanges();
    sel.setBaseAndExtent(baseNode, base.offset, extentNode, extent.offset);
    return sel;
  }

  it('deletes forward from the middle of line 0 to the middle of line 2', () => {
    const { lines } = makeEditor();
    const sel = select(lines, { line: 0, offset: 5 }, { line: 2, offset: 5 });
    const anchor = resolveLinePosition(selLines(lines), selNode(sel.anchorNode), sel.anchorOffset);
    const focus = resolveLinePosition(selLines(lines), selNode(sel.focusNode), sel.focusOffset);
    const { start, end } = orderedRange(anchor!, focus!);
    const res = deleteRange(
      { v: 1, lines: [{ text: 'hello world' }, { text: '' }, { text: 'third line' }] },
      start.line,
      start.offset,
      end.line,
      end.offset,
      () => 'k',
    )!;
    // 'hello' prefix + ' line' suffix → 'hello line'; the empty middle line drops.
    expect(res.lines.map((l) => l.text)).toEqual(['hello line']);
    expect(res.caretLine).toBe(0);
    expect(res.caretOffset).toBe(5);
  });

  it('deletes a reversed (backward) selection identically', () => {
    const { lines } = makeEditor();
    const sel = select(lines, { line: 2, offset: 5 }, { line: 0, offset: 5 });
    expect(sel.anchorNode).toBe(lines[2].firstChild);
    expect(sel.focusNode).toBe(lines[0].firstChild);
    const anchor = resolveLinePosition(selLines(lines), selNode(sel.anchorNode), sel.anchorOffset);
    const focus = resolveLinePosition(selLines(lines), selNode(sel.focusNode), sel.focusOffset);
    expect(anchor).toEqual({ line: 2, offset: 5 });
    expect(focus).toEqual({ line: 0, offset: 5 });
    const { start, end } = orderedRange(anchor!, focus!);
    expect(start).toEqual({ line: 0, offset: 5 });
    expect(end).toEqual({ line: 2, offset: 5 });
  });

  it('selecting every line end-to-end leaves one empty line', () => {
    const { lines } = makeEditor();
    // full-doc selection: line 0 boundary 0 → line 2 after its text node.
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.setBaseAndExtent(lines[0], 0, lines[2], 1);
    const anchor = resolveLinePosition(selLines(lines), selNode(sel.anchorNode), sel.anchorOffset);
    const focus = resolveLinePosition(selLines(lines), selNode(sel.focusNode), sel.focusOffset);
    const { start, end } = orderedRange(anchor!, focus!);
    const res = deleteRange(
      { v: 1, lines: [{ text: 'hello world' }, { text: '' }, { text: 'third line' }] },
      start.line,
      start.offset,
      end.line,
      end.offset,
      () => 'k',
    )!;
    expect(res.lines.map((l) => l.text)).toEqual(['']);
    expect(res.lines).toHaveLength(1);
  });
});
