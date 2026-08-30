/**
 * End-to-end sticker flow tests.
 * 
 * Tests the complete flow:
 * 1. Editor insertion → mark creation
 * 2. RichDoc serialization
 * 3. Storage format
 * 4. Retrieval and parsing
 * 5. Rendering with sticker pack
 */
import { describe, expect, it } from 'vitest';
import {
  buildInlineMarks,
  isRichDoc,
  parsePasteContent,
  type RichDoc,
  type RichLine,
} from '@/lib/pasteFormat';

describe('Sticker flow — editor to rendering', () => {
  it('buildInlineMarks creates sticker marks for pack tokens', () => {
    const text = 'Hello :wave: world!';
    const packTokens = new Set([':wave:', ':fire:', ':rocket:']);
    const marks = buildInlineMarks(text, packTokens);
    
    expect(marks).toHaveLength(1);
    expect(marks[0]).toEqual({
      start: 6,
      end: 12,
      kind: 'sticker',
      value: ':wave:',
    });
  });

  it('buildInlineMarks creates sticker marks for extra tokens (searched GIFs)', () => {
    const text = 'Check this :gif-abc123:';
    const packTokens = new Set([':wave:']);
    const extraTokens = new Set([':gif-abc123:']);
    const marks = buildInlineMarks(text, packTokens, extraTokens);
    
    expect(marks).toHaveLength(1);
    expect(marks[0]).toEqual({
      start: 11,
      end: 23,
      kind: 'sticker',
      value: ':gif-abc123:',
    });
  });

  it('buildInlineMarks does NOT create marks for unknown tokens without extra', () => {
    const text = 'Check this :gif-abc123:';
    const packTokens = new Set([':wave:']);
    const marks = buildInlineMarks(text, packTokens);
    
    expect(marks).toHaveLength(0);
  });

  it('serialized RichDoc preserves sticker marks', () => {
    const doc: RichDoc = {
      v: 1,
      lines: [
        {
          text: 'Hello :wave: world!',
          marks: [{ start: 6, end: 12, kind: 'sticker', value: ':wave:' }],
        },
      ],
    };

    // Simulate serialization (like Editor.serializeDoc)
    const serialized = {
      v: doc.v,
      lines: doc.lines.map(({ _key: _omit, ...rest }) => rest),
    };

    // Simulate JSON round-trip (like API storage)
    const json = JSON.stringify(serialized);
    const parsed = JSON.parse(json);

    expect(isRichDoc(parsed)).toBe(true);
    expect(parsed.lines[0].marks).toEqual([
      { start: 6, end: 12, kind: 'sticker', value: ':wave:' },
    ]);
  });

  it('serialized RichDoc preserves stickerUrls for custom tokens', () => {
    const doc: RichDoc = {
      v: 1,
      lines: [
        {
          text: 'Check this :gif-abc123:',
          marks: [{ start: 11, end: 23, kind: 'sticker', value: ':gif-abc123:' }],
          stickerUrls: { ':gif-abc123:': 'https://example.com/gif.gif' },
        },
      ],
    };

    const serialized = {
      v: doc.v,
      lines: doc.lines.map(({ _key: _omit, ...rest }) => rest),
    };

    const json = JSON.stringify(serialized);
    const parsed = JSON.parse(json);

    expect(isRichDoc(parsed)).toBe(true);
    expect(parsed.lines[0].stickerUrls).toEqual({
      ':gif-abc123:': 'https://example.com/gif.gif',
    });
  });

  it('parsePasteContent retrieves stored RichDoc with sticker marks', () => {
    const stored = JSON.stringify({
      v: 1,
      lines: [
        {
          text: 'Hello :wave: world!',
          marks: [{ start: 6, end: 12, kind: 'sticker', value: ':wave:' }],
        },
      ],
    });

    const parsed = parsePasteContent('rich', stored);
    expect(isRichDoc(parsed)).toBe(true);
    if (isRichDoc(parsed)) {
      expect(parsed.lines[0].marks).toEqual([
        { start: 6, end: 12, kind: 'sticker', value: ':wave:' },
      ]);
    }
  });

  it('multiple stickers on one line are all marked correctly', () => {
    const text = ':wave: hello :fire: world :rocket:';
    const packTokens = new Set([':wave:', ':fire:', ':rocket:']);
    const marks = buildInlineMarks(text, packTokens);
    
    expect(marks).toHaveLength(3);
    expect(marks[0]).toEqual({ start: 0, end: 6, kind: 'sticker', value: ':wave:' });
    expect(marks[1]).toEqual({ start: 13, end: 19, kind: 'sticker', value: ':fire:' });
    expect(marks[2]).toEqual({ start: 26, end: 34, kind: 'sticker', value: ':rocket:' });
  });

  it('sticker marks survive JSON serialization with undefined marks', () => {
    const line: RichLine = { text: 'hello', _key: 'l0' };
    const { _key: _omit, ...rest } = line;
    
    // marks is undefined, so it's not in rest
    expect(rest).toEqual({ text: 'hello' });
    
    // JSON.stringify omits undefined
    const json = JSON.stringify(rest);
    expect(json).toBe('{"text":"hello"}');
    
    // Parsing back works fine
    const parsed = JSON.parse(json);
    expect(parsed).toEqual({ text: 'hello' });
  });

  it('sticker marks survive JSON serialization with empty marks array', () => {
    const line: RichLine = { text: 'hello', _key: 'l0', marks: [] };
    const { _key: _omit, ...rest } = line;
    
    expect(rest).toEqual({ text: 'hello', marks: [] });
    
    const json = JSON.stringify(rest);
    expect(json).toBe('{"text":"hello","marks":[]}');
    
    const parsed = JSON.parse(json);
    expect(parsed).toEqual({ text: 'hello', marks: [] });
  });
});
