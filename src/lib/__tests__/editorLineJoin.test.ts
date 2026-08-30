/**
 * Regression tests — editor line delete/join (audit fix #7).
 *
 * The rich composer renders each line as its own uncontrolled
 * contentEditable. Enter splits a line (existing behavior); Backspace at
 * the start of a line must join that line with the previous one, because
 * the browser cannot join across separate contentEditables on its own.
 *
 * The join/split transforms are pure doc → doc functions in
 * src/lib/editorLineOps.ts so they're exercised here without a DOM. The
 * Editor wires them up in handleLineKey (Backspace at caret offset 0 →
 * join; Enter → split) and recomputes each merged/split line's inline
 * marks afterwards, so stickers/GIFs/emoji/links survive via the shared
 * stickerUrls + text.
 */
import { describe, expect, it } from 'vitest';

import {
  mergeLineIntoPrevious,
  splitLineAtOffset,
  type NewLineKey,
} from '@/lib/editorLineOps';
import {
  buildInlineMarks,
  type RichDoc,
  type RichLine,
} from '@/lib/pasteFormat';

function doc(lines: RichLine[]): RichDoc {
  return { v: 1, lines };
}

/** Deterministic key allocator so assertions are stable. */
function keyer(): NewLineKey {
  let n = 0;
  return () => `k${n++}`;
}

function text(d: RichDoc): string[] {
  return d.lines.map((l) => l.text);
}

describe('Editor join — Backspace at start of line', () => {
  it('joins line i with the previous line (two lines become one, in order)', () => {
    const d = doc([{ text: 'hello' }, { text: 'world' }]);
    const out = mergeLineIntoPrevious(d, 1, keyer());
    expect(out.lines).toHaveLength(1);
    expect(text(out)).toEqual(['helloworld']);
  });

  it('keeps the previous (upper) line formatting on the merged line', () => {
    const d = doc([
      { text: 'hello', font: 'serif', size: 20, color: '#a78bfa' },
      { text: 'world', font: 'mono', size: 12, color: '#ffffff' },
    ]);
    const out = mergeLineIntoPrevious(d, 1, keyer());
    expect(out.lines[0]).toMatchObject({
      text: 'helloworld',
      font: 'serif',
      size: 20,
      color: '#a78bfa',
    });
  });

  it('merges sticker/GIF url maps from both lines so rich marks survive', () => {
    const d = doc([
      { text: ':wave:', stickerUrls: { ':wave:': 'https://a/1.gif' } },
      { text: ':fire:', stickerUrls: { ':fire:': 'https://a/2.gif' } },
    ]);
    const out = mergeLineIntoPrevious(d, 1, keyer());
    expect(out.lines[0].stickerUrls).toEqual({
      ':wave:': 'https://a/1.gif',
      ':fire:': 'https://a/2.gif',
    });
    // Marks are reset for the caller to recompute from merged text; with the
    // merged urls the editor's mark rebuild recognizes BOTH tokens.
    const marks = buildInlineMarks(
      out.lines[0].text,
      new Set(),
      new Set(Object.keys(out.lines[0].stickerUrls ?? {})),
    );
    const stickerKinds = marks.filter((m) => m.kind === 'sticker');
    expect(stickerKinds.map((m) => m.value)).toEqual([':wave:', ':fire:']);
  });

  it('deletes an empty line by joining it into the previous line', () => {
    const d = doc([{ text: 'hello' }, { text: '' }, { text: 'world' }]);
    const out = mergeLineIntoPrevious(d, 1, keyer());
    expect(out.lines).toHaveLength(2);
    expect(text(out)).toEqual(['hello', 'world']);
  });

  it('removes a trailing empty line sensibly (empty last line joins up)', () => {
    const d = doc([{ text: 'hello' }, { text: '' }]);
    const out = mergeLineIntoPrevious(d, 1, keyer());
    expect(out.lines).toHaveLength(1);
    expect(text(out)).toEqual(['hello']);
  });

  it('does not remove the only remaining line (first line is safe)', () => {
    const d = doc([{ text: '' }]);
    const out = mergeLineIntoPrevious(d, 0, keyer());
    expect(out.lines).toHaveLength(1);
    expect(text(out)).toEqual(['']);
  });

  it('first-line Backspace is safe (nothing before it to join)', () => {
    const d = doc([{ text: 'only' }, { text: 'next' }]);
    const out = mergeLineIntoPrevious(d, 0, keyer());
    expect(out).toBe(d);
    expect(text(out)).toEqual(['only', 'next']);
  });

  it('out-of-range join leaves the doc unchanged', () => {
    const d = doc([{ text: 'a' }, { text: 'b' }]);
    expect(mergeLineIntoPrevious(d, 99, keyer())).toBe(d);
    expect(mergeLineIntoPrevious(d, -1, keyer())).toBe(d);
  });
});

describe('Editor split — Enter behavior is preserved', () => {
  it('splits a line at an offset into two ordered halves', () => {
    const d = doc([{ text: 'hello world', font: 'mono', size: 14 }]);
    const out = splitLineAtOffset(d, 0, 5, keyer());
    expect(out.lines).toHaveLength(2);
    expect(text(out)).toEqual(['hello', ' world']);
  });

  it('right half keeps font/size/color; left keeps full formatting', () => {
    const d = doc([{ text: 'abcdef', font: 'serif', size: 18, color: '#a78bfa' }]);
    const out = splitLineAtOffset(d, 0, 2, keyer());
    expect(out.lines[0]).toMatchObject({ text: 'ab', font: 'serif', size: 18, color: '#a78bfa' });
    expect(out.lines[1]).toMatchObject({ text: 'cdef', font: 'serif', size: 18, color: '#a78bfa' });
  });

  it('shares sticker urls across both split halves so GIFs survive', () => {
    const d = doc([{ text: 'x:fire:y', stickerUrls: { ':fire:': 'https://a/f.gif' } }]);
    const out = splitLineAtOffset(d, 0, 3, keyer());
    expect(out.lines[0].stickerUrls).toEqual({ ':fire:': 'https://a/f.gif' });
    expect(out.lines[1].stickerUrls).toEqual({ ':fire:': 'https://a/f.gif' });
  });

  it('splitting at 0 and at the end keeps all content', () => {
    const d = doc([{ text: 'abc' }]);
    const start = splitLineAtOffset(d, 0, 0, keyer());
    expect(text(start)).toEqual(['', 'abc']);
    const end = splitLineAtOffset(d, 0, 3, keyer());
    expect(text(end)).toEqual(['abc', '']);
  });

  it('invalid offset leaves the doc unchanged', () => {
    const d = doc([{ text: 'abc' }]);
    expect(splitLineAtOffset(d, 0, -1, keyer())).toBe(d);
    expect(splitLineAtOffset(d, 0, 99, keyer())).toBe(d);
    expect(splitLineAtOffset(d, 5, 0, keyer())).toBe(d);
  });
});
