/**
 * Regression tests — multi-line paste splitting (audit fix #8).
 *
 * Pasting clipboard content with multiple lines must create separate editor
 * lines, not one line containing embedded newline characters. The transform
 * lives in the pure helper `applyMultiLinePaste` in src/lib/editorLineOps.ts
 * (wired into the Editor's onPaste handler, which recomputes each created
 * line's inline marks and places the caret after the last pasted line).
 *
 * These tests pin the pure transform: multi-line split, single-line passthrough,
 * leading/trailing newlines, empty lines, large pastes, and interaction with
 * existing content on the pasted-into line.
 */
import { describe, expect, it } from 'vitest';

import {
  applyMultiLinePaste,
  type NewLineKey,
} from '@/lib/editorLineOps';
import { type RichLine } from '@/lib/pasteFormat';

function keyer(): NewLineKey {
  let n = 0;
  return () => `k${n++}`;
}

/** Minimal line helper: (text, extra?) */
function line(text: string, extra: Partial<RichLine> = {}): RichLine {
  return { text, ...extra };
}

describe('applyMultiLinePaste — multi-line clipboard content', () => {
  it('turns a 3-line payload into 3 editor lines', () => {
    const res = applyMultiLinePaste(line(''), 0, 'one\ntwo\nthree', keyer());
    expect(res).not.toBeNull();
    expect(res!.lines.map((l) => l.text)).toEqual(['one', 'two', 'three']);
  });

  it('single-line paste is a passthrough (returns null → browser default)', () => {
    expect(applyMultiLinePaste(line('x'), 0, 'single line only', keyer())).toBeNull();
  });

  it('splits around existing content on the pasted-into line', () => {
    // "hello world", caret before "world" (offset 6): prefix "hello ",
    // suffix "world". Pasting "A\nB" → "hello A", "Bworld".
    const res = applyMultiLinePaste(line('hello world'), 6, 'A\nB', keyer());
    expect(res!.lines.map((l) => l.text)).toEqual(['hello A', 'Bworld']);
  });

  it('preserves existing prefix and suffix around a paste in the middle', () => {
    const res = applyMultiLinePaste(line('abcXYZ'), 3, 'p\nq\nr', keyer());
    expect(res!.lines.map((l) => l.text)).toEqual(['abcp', 'q', 'rXYZ']);
  });

  it('leading newline yields a leading empty line', () => {
    const res = applyMultiLinePaste(line(''), 0, '\nfoo', keyer());
    expect(res!.lines.map((l) => l.text)).toEqual(['', 'foo']);
  });

  it('trailing newline yields a trailing empty line (matches Enter split)', () => {
    const res = applyMultiLinePaste(line(''), 0, 'foo\n', keyer());
    expect(res!.lines.map((l) => l.text)).toEqual(['foo', '']);
  });

  it('empty lines between content are preserved as separate lines', () => {
    const res = applyMultiLinePaste(line(''), 0, 'a\n\nb', keyer());
    expect(res!.lines.map((l) => l.text)).toEqual(['a', '', 'b']);
  });

  it('all-newline payload just splits the line (keeps prefix and suffix)', () => {
    const res = applyMultiLinePaste(line('xy'), 1, '\n', keyer());
    expect(res!.lines.map((l) => l.text)).toEqual(['x', 'y']);
  });

  it('handles a large multi-line paste without truncating or imposing a limit', () => {
    const big = Array.from({ length: 500 }, (_, k) => `line-${k}`).join('\n');
    const res = applyMultiLinePaste(line(''), 0, big, keyer());
    expect(res!.lines).toHaveLength(500);
    expect(res!.lines[0].text).toBe('line-0');
    expect(res!.lines[499].text).toBe('line-499');
  });

  it('carries the line formatting onto every created line', () => {
    const res = applyMultiLinePaste(line('', { font: 'mono', size: 16, color: '#22d3ee' }), 0, 'a\nb', keyer());
    for (const l of res!.lines) {
      expect(l.font).toBe('mono');
      expect(l.size).toBe(16);
      expect(l.color).toBe('#22d3ee');
    }
  });

  it('shares sticker/GIF urls so rich marks survive across created lines', () => {
    const urls = { ':fire:': 'https://a/f.gif', ':wave:': 'https://a/w.gif' };
    const res = applyMultiLinePaste(line('', { stickerUrls: urls }), 0, 'a\nb\nc', keyer());
    expect(res!.lines.every((l) => l.stickerUrls)).toBe(true);
    for (const l of res!.lines) {
      expect(l.stickerUrls).toEqual(urls);
    }
  });

  it('caret lands at the end of the last pasted line (before suffix)', () => {
    // "ab | cd", paste "x\ny" at offset 2 → lines "abx", "ycd"; caret at 1.
    const res = applyMultiLinePaste(line('abcd'), 2, 'x\ny', keyer());
    expect(res!.caretInLastLine).toBe(1);
    expect(res!.lines[1].text).toBe('ycd');
  });

  it('marks are reset (undefined) for the caller to recompute', () => {
    const res = applyMultiLinePaste(line('a', { marks: [{ start: 0, end: 1, kind: 'link', value: 'x' }] }), 0, 'p\nq', keyer());
    expect(res!.lines[0].marks).toBeUndefined();
    expect(res!.lines[1].marks).toBeUndefined();
  });
});
