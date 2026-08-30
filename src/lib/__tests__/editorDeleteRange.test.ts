/**
 * Regression tests — cross-line selection delete (editor).
 *
 * Each editor line is its own uncontrolled contentEditable, so the
 * browser's default Backspace/Delete only ever acts inside ONE line.
 * A selection whose endpoints sit in different lines must be removed as
 * a single doc-level range. The transform lives in the pure helper
 * `deleteRange` in src/lib/editorLineOps.ts (wired into the Editor's
 * handleLineKey via the DOM-selection interpreter in
 * src/lib/editorSelection.ts).
 *
 * These tests pin the pure transform: single-line deletions (unchanged
 * textarea-like behavior), cross-line merges, fully-selected lines
 * disappearing, reversed selections, empty lines inside the range,
 * select-all keeping the minimum one-line structure, caret restoration,
 * formatting/sticker-url survival on the merged line, and invalid
 * ranges as no-ops.
 */
import { describe, expect, it } from 'vitest';

import {
  deleteRange,
  type DeleteRangeResult,
  type NewLineKey,
} from '@/lib/editorLineOps';
import { buildInlineMarks, type RichDoc, type RichLine } from '@/lib/pasteFormat';

function doc(lines: RichLine[]): RichDoc {
  return { v: 1, lines };
}

/** Deterministic key allocator so assertions are stable. */
function keyer(): NewLineKey {
  let n = 0;
  return () => `k${n++}`;
}

function texts(res: DeleteRangeResult): string[] {
  return res.lines.map((l) => l.text);
}

/** Deletes [sL,sO)..[eL,eO) and asserts the transform produced a result. */
function del(d: RichDoc, sL: number, sO: number, eL: number, eO: number): DeleteRangeResult {
  const res = deleteRange(d, sL, sO, eL, eO, keyer());
  if (!res) throw new Error('expected deleteRange to produce a result');
  return res;
}

describe('deleteRange — single-line deletions (unchanged behavior)', () => {
  it('removes the middle of a line and keeps the surrounding text', () => {
    const res = del(doc([{ text: 'hello world' }]), 0, 5, 0, 11);
    expect(texts(res)).toEqual(['hello']);
    expect(res.caretLine).toBe(0);
    expect(res.caretOffset).toBe(5);
  });

  it('deleting the whole line leaves an empty line (the line itself survives)', () => {
    const res = del(doc([{ text: 'hello' }]), 0, 0, 0, 5);
    expect(texts(res)).toEqual(['']);
    expect(res.caretLine).toBe(0);
    expect(res.caretOffset).toBe(0);
  });

  it('keeps the line formatting and resets marks for recompute', () => {
    const d = doc([
      {
        text: 'abcdef',
        font: 'serif',
        size: 20,
        color: '#a78bfa',
        marks: [{ start: 0, end: 6, kind: 'link', value: 'https://x.dev' }],
      },
    ]);
    const res = del(d, 0, 1, 0, 4);
    expect(res.lines[0]).toMatchObject({
      text: 'aef',
      font: 'serif',
      size: 20,
      color: '#a78bfa',
    });
    expect(res.lines[0].marks).toBeUndefined();
  });

  it('empty same-line ranges are no-ops; reversed same-line ranges normalize', () => {
    const d = doc([{ text: 'abc' }]);
    expect(deleteRange(d, 0, 2, 0, 2, keyer())).toBeNull();
    // (3,2) is the same range as (2,3) written backwards — a backward
    // drag deletes exactly the same characters as a forward one.
    const reversed = deleteRange(d, 0, 3, 0, 2, keyer());
    expect(reversed).not.toBeNull();
    expect(texts(reversed!)).toEqual(['ab']);
    expect(reversed!.caretOffset).toBe(2);
  });
});

describe('deleteRange — cross-line deletions', () => {
  it('middle of A to middle of B merges prefix and suffix into one line', () => {
    const d = doc([{ text: 'hello world' }, { text: 'goodbye moon' }]);
    const res = del(d, 0, 5, 1, 7);
    expect(texts(res)).toEqual(['hello moon']);
    expect(res.caretLine).toBe(0);
    expect(res.caretOffset).toBe(5);
  });

  it('start of A to end of C removes A, B and C entirely', () => {
    const d = doc([{ text: 'aaa' }, { text: 'bbb' }, { text: 'ccc' }, { text: 'ddd' }]);
    const res = del(d, 0, 0, 2, 3);
    expect(texts(res)).toEqual(['ddd']);
    expect(res.caretLine).toBe(0);
    expect(res.caretOffset).toBe(0);
  });

  it('several complete middle lines disappear; surrounding lines join', () => {
    const d = doc([{ text: 'aaa' }, { text: 'bbb' }, { text: 'ccc' }, { text: 'ddd' }]);
    const res = del(d, 1, 0, 2, 3);
    expect(texts(res)).toEqual(['aaa', 'ddd']);
    expect(res.caretLine).toBe(1);
    expect(res.caretOffset).toBe(0);
  });

  it('a reversed selection deletes exactly the same range', () => {
    const d = doc([{ text: 'aaa' }, { text: 'bbb' }, { text: 'ccc' }, { text: 'ddd' }]);
    const forward = del(d, 0, 0, 2, 3);
    const reversed = del(d, 2, 3, 0, 0);
    expect(texts(reversed)).toEqual(texts(forward));
    expect(reversed.caretLine).toBe(forward.caretLine);
    expect(reversed.caretOffset).toBe(forward.caretOffset);
  });

  it('selection ending at the start of the next line keeps that line intact', () => {
    const d = doc([{ text: 'aaa' }, { text: 'bbb' }, { text: 'ccc' }]);
    const res = del(d, 0, 1, 2, 0);
    expect(texts(res)).toEqual(['accc']);
    expect(res.caretLine).toBe(0);
    expect(res.caretOffset).toBe(1);
  });

  it('a selection containing empty lines drops them', () => {
    const d = doc([{ text: 'aaa' }, { text: '' }, { text: 'bbb' }, { text: 'ccc' }]);
    // 'a' prefix + 'bb' suffix; the empty middle line disappears.
    const res = del(d, 0, 1, 2, 1);
    expect(texts(res)).toEqual(['abb', 'ccc']);
  });

  it('selecting everything keeps the required minimum one-line structure', () => {
    const d = doc([{ text: 'one' }, { text: 'two' }, { text: 'three' }]);
    const res = del(d, 0, 0, 2, 5);
    expect(texts(res)).toEqual(['']);
    expect(res.lines).toHaveLength(1);
    expect(res.caretLine).toBe(0);
    expect(res.caretOffset).toBe(0);
  });

  it('deleting through the end of the doc lands the caret at the last line end', () => {
    const d = doc([{ text: 'aaa' }, { text: 'bbb' }, { text: 'ccc' }]);
    const res = del(d, 1, 0, 2, 3);
    expect(texts(res)).toEqual(['aaa']);
    expect(res.caretLine).toBe(0);
    expect(res.caretOffset).toBe(3);
  });

  it('deleting a first-line + middle block keeps later lines in order', () => {
    const d = doc([{ text: 'aaa' }, { text: 'bbb' }, { text: 'ccc' }, { text: 'ddd' }]);
    const res = del(d, 0, 1, 1, 2);
    // prefix 'a' + suffix 'b' → 'ab'
    expect(texts(res)).toEqual(['ab', 'ccc', 'ddd']);
    expect(res.caretLine).toBe(0);
    expect(res.caretOffset).toBe(1);
  });

  it('merged line keeps the first line formatting and merges sticker urls', () => {
    const d = doc([
      {
        text: ':wave:aa',
        font: 'serif',
        size: 20,
        color: '#a78bfa',
        stickerUrls: { ':wave:': 'https://a/1.gif' },
      },
      {
        text: 'bb',
        font: 'mono',
        size: 12,
        color: '#ffffff',
        stickerUrls: { ':b:': 'https://a/2.gif' },
      },
    ]);
    // [6,8) of line 0 .. [0,2) of line 1: the ':wave:' prefix of the
    // first line survives, the whole second line is covered, and both
    // url maps merge onto the replacement.
    const res = del(d, 0, 6, 1, 2);
    expect(res.lines[0]).toMatchObject({
      text: ':wave:',
      font: 'serif',
      size: 20,
      color: '#a78bfa',
    });
    expect(res.lines[0].stickerUrls).toEqual({
      ':wave:': 'https://a/1.gif',
      ':b:': 'https://a/2.gif',
    });
    expect(res.lines[0].marks).toBeUndefined();
    // The caller's mark rebuild (extra = surviving sticker urls) still
    // recognizes the token that remains in the merged text.
    const marks = buildInlineMarks(
      res.lines[0].text,
      new Set(),
      new Set(Object.keys(res.lines[0].stickerUrls ?? {})),
    );
    expect(marks.filter((m) => m.kind === 'sticker').map((m) => m.value)).toEqual([':wave:']);
  });

  it('marks on the merged line are recomputed from the merged text (links)', () => {
    const d = doc([
      { text: 'see https://a.dev now', marks: [{ start: 4, end: 18, kind: 'link', value: 'https://a.dev' }] },
      { text: 'more text' },
    ]);
    const res = del(d, 0, 4, 1, 4);
    // prefix 'see ' + suffix ' text' → 'see  text'; no marks survive the reset
    expect(texts(res)).toEqual(['see  text']);
    expect(res.lines[0].marks).toBeUndefined();
  });

  it('offsets beyond the line length are clamped', () => {
    const d = doc([{ text: 'aaa' }, { text: 'bbb' }]);
    const res = del(d, 0, 0, 1, 99);
    // start 0..end 3 → merged '' → block dropped → minimum structure
    expect(texts(res)).toEqual(['']);
    expect(res.lines).toHaveLength(1);
  });

  it('invalid ranges leave the doc untouched (null)', () => {
    const d = doc([{ text: 'a' }, { text: 'b' }]);
    expect(deleteRange(d, -1, 0, 1, 1, keyer())).toBeNull();
    expect(deleteRange(d, 0, 0, 5, 0, keyer())).toBeNull();
  });

  it('a wide range over a large doc is handled in one pass', () => {
    const big = doc(Array.from({ length: 2000 }, (_, k) => ({ text: `line ${k}` })));
    const res = del(big, 500, 2, 1500, 4);
    // lines 500..1500 (1001 lines) collapse into one merged line.
    expect(res.lines).toHaveLength(2000 - 1001 + 1);
    expect(res.lines[499].text).toBe('line 499');
    expect(res.lines[500].text).toBe('li 1500'); // 'li' + ' 1500'
    expect(res.lines[501].text).toBe('line 1501');
    expect(res.caretLine).toBe(500);
    expect(res.caretOffset).toBe(2);
  });
});
