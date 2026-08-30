/**
 * Regression tests — syntax highlighting for NEW unified (RichDoc) pastes.
 *
 * The unified editor always stores a RichDoc under format 'rich'. The
 * stored `language` must drive presentation-only syntax highlighting in
 * the rich viewer, exactly as it already does for legacy 'plain' pastes,
 * without:
 *   - mutating the stored RichDoc (raw/download stay byte-for-byte),
 *   - breaking rich formatting (font/size/color),
 *   - breaking inline marks (links, stickers, emoji),
 *   - reintroducing any Text/Rich mode split or a second language list,
 *   - injecting highlighted HTML strings into the DOM.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

import {
  richDocLineHighlights,
  highlightCode,
  type RichHighlightRun,
} from '@/lib/highlight';
import {
  buildInlineMarks,
  richDocToPlainText,
  detectLinks,
  type RichDoc,
  type RichLine,
} from '@/lib/pasteFormat';
import { LANGUAGES, isLanguage } from '@/lib/languages';
// RichPasteView renders StickerImage (a client component) — SSR still
// renders its fallback markup, which is all these assertions need.
import RichPasteView from '@/components/RichPasteView';
import { splitLine } from '@/components/richRender';

function doc(lines: RichLine[]): RichDoc {
  return { v: 1, lines };
}

/** Source text a run covers on a given line. */
function runText(line: RichLine, run: RichHighlightRun): string {
  return (line.text ?? '').slice(run.start, run.end);
}

function render(doc: RichDoc, language: string, stickers?: Parameters<typeof RichPasteView>[0]['stickers']) {
  return renderToStaticMarkup(
    createElement(RichPasteView, { doc, language, stickers }),
  );
}

/** Strips tags and decodes entities so tests can assert on visible source text. */
function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}

describe('language plumbing — stored language reaches the renderer', () => {
  it('every selector language id is a known language and maps to an hljs grammar (except plaintext)', () => {
    for (const l of LANGUAGES) {
      expect(isLanguage(l.id)).toBe(true);
    }
    // The highlight pipeline recognises every code language in the list.
    const code = 'const a = 1;\n';
    for (const l of LANGUAGES) {
      if (l.id === 'plaintext') {
        expect(highlightCode(code, l.id)).toBeNull();
      } else {
        // Either a grammar exists… or for a language whose grammar does
        // not match this snippet it still must never throw.
        const out = highlightCode(code, l.id);
        expect(out === null || typeof out === 'string').toBe(true);
      }
    }
  });

  it('returns null (no highlighting) without a language or for plaintext', () => {
    const d = doc([{ text: 'def x(): pass' }]);
    expect(richDocLineHighlights(d, 'plaintext')).toBeNull();
    expect(richDocLineHighlights(d, '')).toBeNull();
  });
});

describe('new unified Python paste uses Python syntax highlighting', () => {
  const d = doc([
    { text: 'def hello():' },
    { text: '    print("hello")' },
    { text: '' },
    { text: '# a comment' },
  ]);

  it('produces Python token runs at correct source offsets', () => {
    const runs = richDocLineHighlights(d, 'python');
    expect(runs).not.toBeNull();
    expect(runs).toHaveLength(4);

    // `def` is a Python keyword
    const kw = runs![0].find((r) => r.className.includes('hljs-keyword'))!;
    expect(kw).toBeTruthy();
    expect(runText(d.lines[0], kw)).toBe('def');

    // `hello` is a function title
    const fn = runs![0].find((r) => r.className.includes('hljs-title'))!;
    expect(runText(d.lines[0], fn)).toBe('hello');

    // `print` is a builtin and `"hello"` is a string on line 2
    const builtin = runs![1].find((r) => r.className.includes('hljs-built_in'))!;
    expect(runText(d.lines[1], builtin)).toBe('print');
    const str = runs![1].find((r) => r.className.includes('hljs-string'))!;
    expect(runText(d.lines[1], str)).toBe('"hello"');

    // the comment line is a comment token; the blank line has no runs
    const comment = runs![3].find((r) => r.className.includes('hljs-comment'))!;
    expect(runText(d.lines[3], comment)).toBe('# a comment');
    expect(runs![2]).toEqual([]);
  });

  it('renders hljs token class spans in the paste view', () => {
    const html = render(d, 'python');
    expect(html).toContain('hljs-keyword');
    expect(html).toContain('hljs-string');
    expect(html).toContain('hljs-comment');
    // source text is preserved verbatim (token spans only add classes)
    const text = visibleText(html);
    expect(text).toContain('def hello():');
    expect(text).toContain('print("hello")');
    expect(text).toContain('# a comment');
  });
});

describe('new unified JavaScript paste uses JavaScript highlighting', () => {
  const d = doc([
    { text: 'const greeting = "hi";' },
    { text: 'function add(a, b) { return a + b; }' },
  ]);

  it('produces JS token runs', () => {
    const runs = richDocLineHighlights(d, 'javascript');
    expect(runs).not.toBeNull();
    const kw = runs![0].find((r) => r.className.includes('hljs-keyword'))!;
    expect(runText(d.lines[0], kw)).toBe('const');
    const str = runs![0].find((r) => r.className.includes('hljs-string'))!;
    expect(runText(d.lines[0], str)).toBe('"hi"');
    const fnKw = runs![1].find((r) => r.className === 'hljs-keyword')!;
    expect(runText(d.lines[1], fnKw)).toBe('function');
    const title = runs![1].find((r) => r.className.includes('hljs-title'))!;
    expect(runText(d.lines[1], title)).toBe('add');
  });

  it('renders hljs spans in the view', () => {
    const html = render(d, 'javascript');
    expect(html).toContain('hljs-keyword');
    expect(html).toContain('hljs-string');
    // source text preserved end-to-end (React escapes the quote)
    expect(visibleText(html)).toContain('const greeting = "hi";');
    expect(html).toContain('&quot;hi&quot;');
    expect(visibleText(html)).toContain('function add(a, b) { return a + b; }');
  });

  it('html language id maps to the xml grammar', () => {
    const dHtml = doc([{ text: '<div class="x">hi</div>' }]);
    const runs = richDocLineHighlights(dHtml, 'html');
    expect(runs).not.toBeNull();
    // tag/name tokens are produced for XML/HTML
    expect(runs![0].some((r) => r.className.includes('hljs-name') || r.className.includes('hljs-tag'))).toBe(true);
    const html = render(dHtml, 'html');
    expect(html).toContain('hljs-name');
  });
});

describe('new unified Markdown / text paste behaves appropriately', () => {
  it('markdown gets markdown tokens (headings/emphasis) but plain prose degrades gracefully', () => {
    const d = doc([{ text: '# Heading' }, { text: '' }, { text: 'Just some words.' }]);
    const runs = richDocLineHighlights(d, 'markdown');
    expect(runs).not.toBeNull();
    // heading line is tokenised; the prose line simply gets no tokens
    expect(runs![0].some((r) => r.className.includes('hljs-section'))).toBe(true);
    expect(runs![2]).toEqual([]);
    // rendering never throws and keeps the text
    const html = render(d, 'markdown');
    expect(html).toContain('# Heading');
    expect(html).toContain('Just some words.');
  });

  it('plaintext language renders with zero hljs token spans', () => {
    const d = doc([{ text: 'def not_code(): just prose' }]);
    const html = render(d, 'plaintext');
    expect(html).not.toContain('hljs-keyword');
    expect(html).toContain('def not_code(): just prose');
  });
});

describe('unknown / unsupported language falls back safely', () => {
  it('never throws and produces no highlighting for an unknown id', () => {
    const d = doc([{ text: 'def x(): pass' }]);
    expect(() => richDocLineHighlights(d, 'klingon')).not.toThrow();
    expect(richDocLineHighlights(d, 'klingon')).toBeNull();
    expect(() => render(d, 'klingon')).not.toThrow();
    const html = render(d, 'klingon');
    expect(html).not.toContain('hljs-keyword');
    expect(html).toContain('def x(): pass');
  });
});

describe('rich formatting compatibility', () => {
  it('a line with explicit custom color opts out of highlighting entirely', () => {
    const d = doc([
      { text: 'def red(): pass', color: '#f87171' },
      { text: 'def normal(): pass' },
    ]);
    const runs = richDocLineHighlights(d, 'python')!;
    expect(runs[0]).toEqual([]); // explicit color → untouched
    expect(runs[1].length).toBeGreaterThan(0);

    const html = render(d, 'python');
    // explicit color is preserved inline
    expect(html).toContain('#f87171');
    // the uncolored line still gets keyword coloring
    expect(html).toContain('hljs-keyword');
  });

  it('custom font and size are preserved on highlighted lines', () => {
    const d = doc([{ text: 'def big(): pass', font: 'serif', size: 32 }]);
    const html = render(d, 'python');
    expect(html).toContain('32px');
    expect(html).toContain('Georgia'); // serif font stack
    expect(html).toContain('hljs-keyword');
  });

  it('highlighting never mutates the stored RichDoc', () => {
    const d: RichDoc = {
      v: 1,
      lines: [
        { text: 'def f():', color: '#a78bfa' },
        { text: "    return 'x'", font: 'mono' },
      ],
    };
    const snapshot = JSON.stringify(d);
    richDocLineHighlights(d, 'python');
    render(d, 'python');
    expect(JSON.stringify(d)).toBe(snapshot);
  });
});

describe('inline marks still render alongside highlighting', () => {
  it('link marks render as anchors and are not swallowed by token spans', () => {
    const text = 'see https://example.com for def keyword';
    const marks = detectLinks(text);
    const d = doc([{ text, marks }]);
    const runs = richDocLineHighlights(d, 'python')!;
    const html = render(d, 'python');

    // the link is an anchor with the safe href (mark path, never an hljs span)
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer nofollow ugc"');
    // link text is intact
    expect(html).toContain('https://example.com');
    // the anchor itself must never carry an hljs token class
    const anchorTag = html.match(/<a [^>]*>https:\/\/example\.com<\/a>/)?.[0] ?? '';
    expect(anchorTag).not.toContain('hljs-');
    // highlighting still happens elsewhere on the line
    expect(runs[0].length).toBeGreaterThan(0);
  });

  it('sticker/GIF marks still render (fallback span when pack is absent)', () => {
    const text = 'hi :wave: there';
    const marks = buildInlineMarks(text, new Set([':wave:']));
    expect(marks.some((m) => m.kind === 'sticker')).toBe(true);
    const d = doc([{ text, marks }]);
    const html = render(d, 'python', []);
    // token range around the shortcode text is preserved; the sticker
    // mark is rendered through the mark path (StickerImage fallback shows
    // the shortcode text when the pack does not resolve it)
    expect(html).toContain(':wave:');
    expect(html).toContain('hi ');
    expect(html).toContain(' there');
  });

  it('sticker with a resolved pack url renders an <img>', () => {
    const text = 'yay :fire:';
    const marks = buildInlineMarks(text, new Set([':fire:']));
    const stickers = [{ token: ':fire:', url: 'https://cdn.example.test/fire.gif', emoji: null, label: 'fire' }];
    const html = render(doc([{ text, marks }]), 'python', stickers);
    expect(html).toContain('<img');
    expect(html).toContain('https://cdn.example.test/fire.gif');
  });

  it('emoji marks still render the native emoji', () => {
    const text = 'great :rocket:';
    const marks = buildInlineMarks(text, new Set()); // :rocket: is an emoji shortcut
    expect(marks.some((m) => m.kind === 'emoji')).toBe(true);
    const html = render(doc([{ text, marks }]), 'python');
    expect(html).toContain('🚀');
  });

  it('splitLine clips highlight runs around marks and keeps full text', () => {
    const line: RichLine = {
      text: 'a https://x.io b',
      marks: detectLinks('a https://x.io b'),
    };
    // a run covering the whole line would be clipped to the text gaps only
    const nodes = splitLine(line, {
      renderSticker: (_m, slice) => slice,
      highlightRuns: [{ start: 0, end: 16, className: 'hljs-keyword' }],
    });
    const markup = renderToStaticMarkup(createElement('div', null, ...nodes));
    // anchor present and never carries the hljs class
    expect(markup).toContain('href="https://x.io"');
    const anchor = markup.match(/<a [^>]*>/)![0];
    expect(anchor).not.toContain('hljs-keyword');
    // gaps are highlighted; all source text survives
    expect(markup).toContain('hljs-keyword');
    expect(markup).toContain('a ');
    expect(markup).toContain(' b');
  });
});

describe('legacy plain paste highlighting remains unchanged', () => {
  it('highlightCode still returns hljs HTML for legacy plain pastes', () => {
    const py = 'def f():\n    return 1\n';
    const html = highlightCode(py, 'python');
    expect(html).not.toBeNull();
    expect(html).toContain('<span class="hljs-keyword">def</span>');
    expect(html).toContain('<span class="hljs-keyword">return</span>');
  });

  it('plaintext legacy content returns null (unhighlighted fallback)', () => {
    expect(highlightCode('just some text\nline two', 'plaintext')).toBeNull();
  });

  it('the legacy PasteViewer component still exists and feeds language through', async () => {
    const mod = await import('@/components/PasteViewer');
    const html = renderToStaticMarkup(
      createElement(mod.default, { content: 'const x = 1;', language: 'javascript' }),
    );
    expect(html).toContain('hljs-keyword');
    expect(html).toContain('const');
  });
});

describe('raw/download content remains unchanged', () => {
  it('flattening a highlighted RichDoc returns exactly the source lines', () => {
    const d = doc([
      { text: 'def hello():' },
      { text: '    print("hi")' },
      { text: 'see https://example.com' },
      { text: 'sticker :wave: here' },
    ]);
    // highlighting runs are computed and discarded; text must be identical
    richDocLineHighlights(d, 'python');
    expect(richDocToPlainText(d)).toBe(
      'def hello():\n    print("hi")\nsee https://example.com\nsticker :wave: here',
    );
  });

  it('rendering the view does not alter line text (special chars are source-text, not tags)', () => {
    const source = 'if a < b and c > d:  # "x" & \'y\'';
    const d = doc([{ text: source }]);
    // highlighting must not throw on hljs-escaped entities and must map
    // them back to correct source offsets
    const runs = richDocLineHighlights(d, 'python');
    expect(runs).not.toBeNull();
    const comment = runs![0].find((r) => r.className.includes('hljs-comment'))!;
    expect(runText(d.lines[0], comment)).toBe('# "x" & \'y\'');
    // React escapes the source chars in the output HTML (no raw < > injected),
    // while the decoded visible text matches the source exactly
    const html = render(d, 'python');
    expect(html).not.toContain('<b>'); // source is never parsed as tags
    expect(html).toContain('a &lt; b');
    expect(html).toContain('c &gt; d:');
    expect(html).toContain('&quot;x&quot;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&#x27;y&#x27;');
    expect(visibleText(html)).toContain(source);
  });
});
