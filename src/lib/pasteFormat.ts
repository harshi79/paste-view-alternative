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
  { id: 'sans', label: 'Sans', css: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { id: 'mono', label: 'Mono', css: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace' },
  { id: 'serif', label: 'Serif', css: 'ui-serif, Georgia, Cambria, "Times New Roman", serif' },
  { id: 'rounded', label: 'Rounded', css: '"Nunito", "SF Pro Rounded", system-ui, sans-serif' },
  { id: 'condensed', label: 'Narrow', css: '"Roboto Condensed", "Arial Narrow", sans-serif' },
  { id: 'display', label: 'Display', css: '"Bebas Neue", "Anton", Impact, sans-serif' },
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

export type { ReactNode };
