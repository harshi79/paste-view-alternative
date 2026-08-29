// ------------------------------------------------------------------
// Paste content format (v2).
//
// Pastes are stored in one of two formats:
//
//   "plain"  — a plain string. Rendered with the existing viewer
//              (highlight.js + line numbers). Links are auto-linked.
//
//   "rich"   — a JSON-encoded `RichDoc` (see below). Allows per-line
//              formatting (font, size, color) plus inline tokens
//              (emoji, sticker, link). Always rendered through
//              <RichPasteView> which links URLs but never previews.
//
// A rich paste is created from the rich-text editor (the new "Editor"
// component) which emits a serialised RichDoc.  The plain-text editor
// still works and posts `format: "plain"`.
// ------------------------------------------------------------------

import type { ReactNode } from 'react';

export type InlineMark = {
  /** [start, end) character offsets within the line. */
  start: number;
  end: number;
  /** 'link' | 'sticker' | 'emoji'. */
  kind: 'link' | 'sticker' | 'emoji';
  /** link -> url, sticker -> token, emoji -> native emoji char. */
  value: string;
};

export type RichLine = {
  text: string;
  font?: string; // CSS font-family, e.g. "Inter, sans-serif"
  size?: number; // px
  color?: string; // hex
  marks?: InlineMark[]; // sorted, non-overlapping
  /**
   * Client-side only: a stable identity used as the React key for the
   * composer's uncontrolled contentEditable lines. Stripped before the doc
   * is stored (see Editor.submit), so it never reaches the database.
   */
  _key?: string;
  /**
   * Optional explicit url for sticker tokens in this line, keyed by the
   * shortcode (e.g. ":anime-hug:" → gif url). Lets the composer embed a
   * sticker/GIF that isn't in the DB pack (e.g. a live anime GIF) and
   * still render reliably in the final paste. Serially saved in the doc.
   */
  stickerUrls?: Record<string, string>;
};

export type RichDoc = { v: 1; lines: RichLine[] };

export const RICH_VERSION = 1 as const;

/** Type guards used by both the server and the client. */
export function isRichDoc(value: unknown): value is RichDoc {
  if (!value || typeof value !== 'object') return false;
  const d = value as Record<string, unknown>;
  if (d.v !== 1) return false;
  if (!Array.isArray(d.lines)) return false;
  return d.lines.every(
    (l) =>
      l && typeof l === 'object' && typeof (l as RichLine).text === 'string',
  );
}

export function parsePasteContent(format: string, content: string): RichDoc | string {
  if (format === 'rich') {
    try {
      const parsed = JSON.parse(content);
      if (isRichDoc(parsed)) return parsed;
    } catch {
      /* fall through to plain */
    }
    return content;
  }
  return content;
}

const FONT_OPTIONS = [
  { id: 'normal', label: 'Normal', css: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' },
  { id: 'sans', label: 'Sans', css: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { id: 'mono', label: 'Mono', css: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace' },
  { id: 'serif', label: 'Serif', css: 'ui-serif, Georgia, Cambria, "Times New Roman", serif' },
  { id: 'rounded', label: 'Rounded', css: '"Nunito", "SF Pro Rounded", system-ui, sans-serif' },
  { id: 'condensed', label: 'Narrow', css: '"Roboto Condensed", "Arial Narrow", sans-serif' },
  { id: 'display', label: 'Display', css: '"Bebas Neue", "Anton", Impact, sans-serif' },
  { id: 'times', label: 'Times', css: '"Times New Roman", Times, serif' },
  { id: 'georgia', label: 'Georgia', css: 'Georgia, Cambria, "Times New Roman", serif' },
  { id: 'palatino', label: 'Palatino', css: '"Palatino Linotype", Palatino, "Book Antiqua", serif' },
  { id: 'typewriter', label: 'Typewriter', css: '"Courier New", Courier, monospace' },
  { id: 'comic', label: 'Comic', css: '"Comic Sans MS", "Comic Sans", "Chalkboard SE", cursive' },
  { id: 'handwritten', label: 'Handwritten', css: '"Segoe Script", "Bradley Hand", "Brush Script MT", cursive' },
  { id: 'verdana', label: 'Verdana', css: 'Verdana, Geneva, Tahoma, sans-serif' },
  { id: 'trebuchet', label: 'Trebuchet', css: '"Trebuchet MS", "Lucida Grande", sans-serif' },
  { id: 'arial', label: 'Arial', css: 'Arial, Helvetica, sans-serif' },
  { id: 'tahoma', label: 'Tahoma', css: 'Tahoma, Geneva, Verdana, sans-serif' },
  { id: 'calibri', label: 'Calibri', css: 'Calibri, "Segoe UI", Arial, sans-serif' },
  { id: 'impact', label: 'Impact', css: 'Impact, "Haettenschweiler", "Arial Narrow Bold", sans-serif' },
  { id: 'franklin', label: 'Franklin', css: '"Franklin Gothic Medium", "Arial Narrow", sans-serif' },
  { id: 'fantasy', label: 'Fantasy', css: 'Papyrus, Copperplate, fantasy' },
] as const;

export type FontId = (typeof FONT_OPTIONS)[number]['id'];

export const FONTS = FONT_OPTIONS;

export function fontCss(id: string | undefined): string | undefined {
  const f = FONT_OPTIONS.find((x) => x.id === id);
  return f?.css;
}

/** Default font applied to a new line. */
export const DEFAULT_FONT: FontId = 'mono';

/** Built-in emoji shortcuts — the editor turns these into emoji. */
export const EMOJI_SHORTCUTS: Record<string, string> = {
  ':)': '🙂',
  ':D': '😄',
  ':(': '😞',
  ';)': '😉',
  ':p': '😛',
  '<3': '❤️',
  '</3': '💔',
  ':+1:': '👍',
  ':-1:': '👎',
  ':fire:': '🔥',
  ':star:': '⭐',
  ':100:': '💯',
  ':eyes:': '👀',
  ':rocket:': '🚀',
  ':sparkles:': '✨',
  ':wave:': '👋',
  ':ok:': '👌',
  ':clap:': '👏',
  ':tada:': '🎉',
  ':bug:': '🐛',
  ':warning:': '⚠️',
};

// ------------------------------------------------------------------
// Inline mark merge helper — used by the rich editor and by the
// "auto-detect links" path.
// ------------------------------------------------------------------

export function detectLinks(text: string): InlineMark[] {
  // Catch a wide variety: http(s)://, www., bare domains (.com/.org/.../),
  // mailto, tel. We deliberately allow anything that LOOKS like a URL.
  const re =
    /\b((?:https?:\/\/|www\.)[^\s<>"]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|tel:\+?[0-9()\-.\s]{4,20})/g;
  const out: InlineMark[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const value = m[0];
    let url = value;
    if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url) && !/^tel:/i.test(url)) {
      if (value.includes('@')) url = 'mailto:' + value;
      else if (/^www\./i.test(value)) url = 'http://' + value;
      else url = 'http://' + value;
    }
    out.push({ start: m.index, end: m.index + value.length, kind: 'link', value: url });
  }
  return out;
}

/** Returns text that, when rendered, has visible replacement of sticker tokens. */
export function inlineCount(line: RichLine): { chars: number; tokens: number } {
  const tokens = (line.marks ?? []).filter((m) => m.kind !== 'link').length;
  return { chars: line.text.length, tokens };
}

// ------------------------------------------------------------------
// Sticker / emoji shortcode detection
// ------------------------------------------------------------------
// Tokens look like `:wave:` or `;happy;`. The rendered result replaces
// them with the sticker/GIF (or fallback emoji) instead of showing the
// raw shortcode.
// ------------------------------------------------------------------

// Must stay consistent with the admin route/server validation
// (^:[a-z0-9_+-]+:$) so hyphenated tokens like :anime-wave: convert too.
const STICKER_TOKEN_RE = /:([a-z0-9_+-]{1,32}):|;([a-z0-9_+-]{1,32});/gi;

export type TokenHit = { start: number; end: number; token: string };

/** Finds every sticker/emoji shortcode in a line of text. */
export function findTokenShorthands(text: string): TokenHit[] {
  const out: TokenHit[] = [];
  let m: RegExpExecArray | null;
  STICKER_TOKEN_RE.lastIndex = 0;
  while ((m = STICKER_TOKEN_RE.exec(text))) {
    const name = m[1] || m[2];
    out.push({ start: m.index, end: m.index + m[0].length, token: `:${name}:` });
  }
  return out;
}

/**
 * Rebuilds the inline marks for a line from scratch:
 * 1. sticker-pack tokens → 'sticker' marks (keep the token as text);
 * 2. remaining emoji shortcuts → 'emoji' marks;
 * 3. URL / email / phone detection → 'link' marks.
 * Runs on every edit so typed or pasted shorthands resolve immediately.
 */
export function buildInlineMarks(
  text: string,
  stickerTokens: ReadonlySet<string>,
): InlineMark[] {
  const marks: InlineMark[] = [];
  for (const hit of findTokenShorthands(text)) {
    if (stickerTokens.has(hit.token)) {
      marks.push({ start: hit.start, end: hit.end, kind: 'sticker', value: hit.token });
    } else if (EMOJI_SHORTCUTS[hit.token]) {
      marks.push({ start: hit.start, end: hit.end, kind: 'emoji', value: EMOJI_SHORTCUTS[hit.token] });
    }
  }
  marks.push(...detectLinks(text));
  return marks.sort((a, b) => a.start - b.start);
}

/** Sorts and drops invalid/overlapping marks defensively (bad data safety). */
export function sanitizeMarks(marks: InlineMark[] | undefined, textLength: number): InlineMark[] {
  if (!marks || marks.length === 0) return [];
  const sorted = marks
    .filter(
      (m) =>
        Number.isInteger(m.start) &&
        Number.isInteger(m.end) &&
        m.start >= 0 &&
        m.end > m.start &&
        m.end <= textLength,
    )
    .sort((a, b) => a.start - b.start);
  const out: InlineMark[] = [];
  let cursor = 0;
  for (const m of sorted) {
    if (m.start < cursor) continue; // overlap → drop
    out.push(m);
    cursor = m.end;
  }
  return out;
}

export type { ReactNode };
