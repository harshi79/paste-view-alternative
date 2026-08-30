// ------------------------------------------------------------------
// Interpreting browser selections across the editor's line elements.
//
// The composer renders each RichDoc line as its own uncontrolled
// contentEditable <div>, so a drag selection can start in one line and
// end in another. Before such a selection can drive a doc-level delete,
// the DOM endpoints (anchorNode/anchorOffset and focusNode/focusOffset)
// must be mapped into RichDoc coordinates: (line index, character
// offset) pairs.
//
// These helpers depend only on the structural shape of DOM nodes
// (nodeType / data / childNodes / parentNode) — no `document`, no
// `Range` — so the exact offset math is unit-testable in a plain Node
// environment and runs unchanged against real DOM nodes in the browser.
// ------------------------------------------------------------------

/** Structural subset of a DOM Node that these helpers read. */
export interface SelNode {
  nodeType: number;
  data?: string | null;
  childNodes?: readonly (SelNode | null)[] | null;
  parentNode?: SelNode | null;
}

/** A position in RichDoc coordinates: line index + character offset. */
export type LinePos = { line: number; offset: number };

const TEXT_NODE = 3;

/** Character length of the text-bearing content of `n` (elements count their children). */
function textLength(n: SelNode): number {
  if (n.nodeType === TEXT_NODE) return n.data?.length ?? 0;
  let total = 0;
  const kids = n.childNodes;
  if (kids) {
    for (const kid of kids) if (kid) total += textLength(kid);
  }
  return total;
}

/**
 * Character offset of a selection endpoint (node, offset) within the
 * line element `root`, counting only text-node characters — the same
 * coordinate space as the RichDoc line `text` (a <br>, for example,
 * contributes 0).
 *
 * - `node === root`: `offset` is a child index (the selection points at
 *   an element boundary); the result is the character length of the
 *   first `offset` children.
 * - `node` inside `root`: the result is the character length of all
 *   content preceding (node, offset) in document order.
 * - `node` outside `root`: 0 (defensive — callers should resolve the
 *   containing line first, see resolveLinePosition).
 */
export function offsetWithinRoot(root: SelNode, node: SelNode, offset: number): number {
  if (node === root) {
    const kids = root.childNodes ?? [];
    const upto = Math.min(Math.max(offset, 0), kids.length);
    let pos = 0;
    for (let k = 0; k < upto; k++) {
      const kid = kids[k];
      if (kid) pos += textLength(kid);
    }
    return pos;
  }
  let pos = 0;
  let found = false;
  const visit = (n: SelNode | null | undefined): boolean => {
    if (!n || found) return found;
    if (n === node) {
      found = true;
      if (n.nodeType === TEXT_NODE) {
        pos += Math.min(Math.max(offset, 0), n.data?.length ?? 0);
      } else {
        const kids = n.childNodes ?? [];
        const upto = Math.min(Math.max(offset, 0), kids.length);
        for (let k = 0; k < upto; k++) {
          const kid = kids[k];
          if (kid) pos += textLength(kid);
        }
      }
      return true;
    }
    pos += textLength(n);
    const kids = n.childNodes;
    if (kids) {
      for (const kid of kids) if (visit(kid)) return true;
    }
    return false;
  };
  for (const kid of root.childNodes ?? []) if (visit(kid)) break;
  return found ? pos : 0;
}

/**
 * Resolves a selection endpoint to a RichDoc (line, offset) position.
 * Returns null when the endpoint is not inside one of the editor's line
 * elements (e.g. a selection dragged outside the editor) — callers fall
 * back to the browser's default behavior in that case.
 */
export function resolveLinePosition(
  lineEls: readonly (SelNode | null)[],
  node: SelNode | null,
  offset: number,
): LinePos | null {
  if (!node) return null;
  // The containing line element is either `node` itself or an ancestor.
  let el: SelNode | null = node;
  while (el) {
    const idx = lineEls.indexOf(el);
    if (idx !== -1) return { line: idx, offset: offsetWithinRoot(el, node, offset) };
    el = el.parentNode ?? null;
  }
  return null;
}

/**
 * Normalizes a (possibly reversed) selection into { start, end } with
 * start ≤ end in document order, so a backward drag deletes exactly the
 * same range as a forward one.
 */
export function orderedRange(
  a: LinePos,
  b: LinePos,
): { start: LinePos; end: LinePos } {
  return a.line < b.line || (a.line === b.line && a.offset <= b.offset)
    ? { start: a, end: b }
    : { start: b, end: a };
}
