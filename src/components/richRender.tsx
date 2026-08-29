import type { ReactNode } from 'react';
import type { RichLine, InlineMark } from '@/lib/pasteFormat';
import { fontCss, sanitizeMarks } from '@/lib/pasteFormat';

/**
 * Splits a rich-text line into React nodes using its inline marks.
 * Shared by the server-rendered paste view and the client-side composer
 * preview so both render stickers/emoji/links identically.
 */
export function splitLine(
  line: RichLine,
  opts: {
    renderSticker: (mark: InlineMark, slice: string) => ReactNode;
    renderEmoji?: (mark: InlineMark, slice: string) => ReactNode;
  },
): ReactNode[] {
  const text = line.text ?? '';
  const marks = sanitizeMarks(line.marks, text.length);
  const out: ReactNode[] = [];
  let cursor = 0;

  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    if (m.start > cursor) {
      out.push(<span key={`t${i}-${cursor}`}>{text.slice(cursor, m.start)}</span>);
    }
    const slice = text.slice(m.start, m.end);
    if (m.kind === 'link') {
      out.push(
        <a
          key={`l${i}-${m.start}`}
          href={m.value}
          target="_blank"
          rel="noopener noreferrer nofollow ugc"
          className="text-brand-300 underline decoration-brand-500/40 underline-offset-2 hover:text-brand-200"
        >
          {slice}
        </a>,
      );
    } else if (m.kind === 'sticker') {
      out.push(<span key={`s${i}-${m.start}`}>{opts.renderSticker(m, slice)}</span>);
    } else if (opts.renderEmoji) {
      out.push(<span key={`e${i}-${m.start}`}>{opts.renderEmoji(m, slice)}</span>);
    } else {
      out.push(<span key={`e${i}-${m.start}`}>{slice}</span>);
    }
    cursor = m.end;
  }
  if (cursor < text.length) {
    out.push(<span key={`tail-${cursor}`}>{text.slice(cursor)}</span>);
  }
  return out;
}

/** CSS font family for a line (falls back to mono). */
export function lineFont(line: RichLine): string {
  return fontCss(line.font) ?? fontCss('mono') ?? 'inherit';
}
