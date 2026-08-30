/**
 * Syntax highlighting.
 *
 * We intentionally register ONLY the languages VibeBin exposes (instead of
 * `highlight.js/lib/common`, which pulls in ~190 grammars). The legacy
 * plain-text viewer runs the highlighting on the server (so the paste page
 * ships zero highlight.js code to the browser); the unified RichDoc viewer
 * renders per-line token classes through the same registered grammars and
 * only pulls this module into lazily-loaded client chunks.
 */
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const LANGUAGES: Record<string, unknown> = {
  bash,
  c,
  cpp,
  csharp,
  css,
  go,
  java,
  javascript,
  json,
  markdown,
  php,
  python,
  ruby,
  rust,
  sql,
  typescript,
  xml,
  yaml,
};

for (const [name, lang] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, lang as Parameters<typeof hljs.registerLanguage>[1]);
}

/** Maps a VibeBin language id to a registered highlight.js grammar. */
export function registeredHljsLanguage(id: string): string | null {
  if (!id || id === 'plaintext') return null;
  return id === 'html' ? 'xml' : id;
}

/** Returns highlighted HTML, or null when no grammar applies. */
export function highlightCode(content: string, language: string): string | null {
  const lang = registeredHljsLanguage(language);
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(content, { language: lang, ignoreIllegals: true }).value;
    }
  } catch {
    /* fall through to plain */
  }
  return null;
}

// ------------------------------------------------------------------
// RichDoc (unified editor) syntax highlighting.
//
// Highlighting here is PRESENTATION ONLY: the stored RichDoc is never
// mutated, and raw/download still flatten the untouched line text. We run
// highlight.js over the WHOLE document (so multi-line constructs like
// block comments and template strings get correct context), then map the
// resulting `<span class="hljs-…">` token ranges back onto individual
// lines by source-text offset. The rich renderer wraps those source
// ranges in plain React <span>s carrying the hljs token class(es) —
// no highlighted HTML string is ever injected into the DOM.
//
// Rich-formatting safety: lines with an explicit text color opt out of
// highlighting entirely so the author's color choice is never overridden;
// per-line font/size keep working (hljs only sets color/font-style/weight),
// and inline marks (links, stickers, emoji) are rendered through the
// existing mark path — the renderer clips highlight ranges around them,
// so a mark can never be swallowed or recolored by a token span.
// ------------------------------------------------------------------

/** One highlighted token, in SOURCE offsets within a single line. */
export type RichHighlightRun = { start: number; end: number; className: string };

/** Parses a `class="…"` attribute value out of an hljs opening span tag. */
function spanClass(tag: string): string {
  const m = /class\s*=\s*"([^"]*)"/i.exec(tag);
  return m ? m[1] : '';
}

/**
 * Source length of an hljs text node: plain chars count as 1, HTML
 * entities (&amp;, &#39;, …) decode to a single source character. hljs
 * only escapes its own five entities, but this tolerates any form.
 */
function hljsTextSourceLength(text: string): number {
  let len = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '&') {
      const semi = text.indexOf(';', i);
      if (semi !== -1 && /^#[0-9]+$|^#[xX][0-9a-fA-F]+$|^[a-zA-Z][a-zA-Z0-9]+$/.test(text.slice(i + 1, semi))) {
        len += 1;
        i = semi;
        continue;
      }
    }
    len += 1;
  }
  return len;
}

/**
 * Computes per-line highlight token runs for a unified (RichDoc) paste.
 *
 * Returns an array parallel to `doc.lines` (an entry per line), or null
 * when the language is plaintext/unknown/unregistered or highlighting
 * throws — the caller then renders the doc completely unchanged. Lines
 * with an explicit rich text color get an empty entry (they opt out of
 * highlighting); every other line may carry zero or more runs whose
 * offsets index that line's raw `text`.
 */
export function richDocLineHighlights(
  doc: { lines: Array<{ text?: string; color?: string }> },
  language: string,
): RichHighlightRun[][] | null {
  const lines = doc.lines ?? [];
  const fullText = lines.map((l) => l.text ?? '').join('\n');
  const html = highlightCode(fullText, language);
  if (html === null) return null;

  // Source offset where each line starts (line 0 at 0; subsequent lines
  // account for the joining '\n').
  const lineStart: number[] = [];
  let off = 0;
  for (const l of lines) {
    lineStart.push(off);
    off += (l.text ?? '').length + 1;
  }

  // Walk the hljs HTML and emit FLAT, non-overlapping document-offset
  // segments: each text node becomes a segment carrying the full stack of
  // open token classes (hljs nests spans, e.g. hljs-meta > hljs-string).
  // Tags are always properly nested in hljs output and never self-closing,
  // so a simple open/close stack is sufficient.
  type GlobalSeg = { start: number; end: number; className: string };
  const segs: GlobalSeg[] = [];
  const openClasses: string[] = [];
  let srcPos = 0;

  const currentClass = () => openClasses.filter(Boolean).join(' ');

  try {
    let i = 0;
    while (i < html.length) {
      const lt = html.indexOf('<', i);
      if (lt === -1) {
        const len = hljsTextSourceLength(html.slice(i));
        if (len > 0 && openClasses.length > 0) {
          segs.push({ start: srcPos, end: srcPos + len, className: currentClass() });
        }
        srcPos += len;
        break;
      }
      if (lt > i) {
        // Text node — entities decode back to their single source char.
        const len = hljsTextSourceLength(html.slice(i, lt));
        if (len > 0 && openClasses.length > 0) {
          const cls = currentClass();
          if (cls) segs.push({ start: srcPos, end: srcPos + len, className: cls });
        }
        srcPos += len;
        i = lt;
        continue;
      }
      const gt = html.indexOf('>', i);
      if (gt === -1) break; // malformed — stop, keep whatever we parsed
      const tag = html.slice(i, gt + 1);
      if (tag.startsWith('</span')) {
        openClasses.pop();
      } else if (tag.startsWith('<span')) {
        openClasses.push(spanClass(tag));
      }
      // hljs only emits <span> tags; anything else carries no source text.
      i = gt + 1;
    }
  } catch {
    return null; // never let a parse surprise break rendering
  }

  // Map document segments onto lines. A token usually lives on one line,
  // but a grammar may emit one that spans lines (e.g. a block comment) —
  // in that case every covered line gets a segment clipped to its range.
  const out: RichHighlightRun[][] = lines.map(() => []);
  for (const seg of segs) {
    if (!seg.className) continue;
    for (let li = 0; li < lines.length; li++) {
      const lineEnd = lineStart[li] + (lines[li].text ?? '').length;
      if (seg.start >= lineEnd) continue; // segment starts after this line
      if (seg.end <= lineStart[li]) break; // segment (and the rest) are before
      const line = lines[li];
      if (line.color !== undefined) continue; // rich-colored line opts out
      const start = Math.max(seg.start - lineStart[li], 0);
      const end = Math.min(seg.end - lineStart[li], (line.text ?? '').length);
      if (end > start) out[li].push({ start, end, className: seg.className });
    }
  }
  return out;
}
