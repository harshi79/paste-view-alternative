import type { ReactNode } from 'react';
import type { RichLine, InlineMark } from '@/lib/pasteFormat';
import { fontCss, sanitizeMarks } from '@/lib/pasteFormat';
import type { RichHighlightRun } from '@/lib/highlight';

/**
 * Splits a rich-text line into React nodes using its inline marks.
 * Shared by the server-rendered paste view and the client-side composer
 * preview so both render stickers/emoji/links identically.
 *
 * `highlightRuns` are PRESENTATION-ONLY syntax tokens (source offsets +
 * hljs class). They are applied to plain text gaps only and clipped
 * around every inline mark, so links/stickers/emoji are always rendered
 * through their dedicated mark path and can never be swallowed or
 * restyled by a token span. The underlying line text is never changed.
 */
export function splitLine(
  line: RichLine,
  opts: {
    renderSticker: (mark: InlineMark, slice: string, stickerUrls?: Record<string, string>) => ReactNode;
    renderEmoji?: (mark: InlineMark, slice: string) => ReactNode;
    /** Token runs for this line (source offsets); undefined = no highlighting. */
    highlightRuns?: RichHighlightRun[];
  },
): ReactNode[] {
  const text = line.text ?? '';
  const marks = sanitizeMarks(line.marks, text.length);
  const out: ReactNode[] = [];
  let cursor = 0;

  const pushText = (from: number, to: number, keyPrefix: string) => {
    if (to <= from) return;
    const runs = opts.highlightRuns;
    if (!runs || runs.length === 0 || line.color !== undefined) {
      out.push(<span key={keyPrefix}>{text.slice(from, to)}</span>);
      return;
    }
    // Clip token runs to this text gap; every piece stays a plain React
    // span — no highlighted HTML is ever injected.
    let pos = from;
    let ri = 0;
    let piece = 0;
    while (pos < to) {
      while (ri < runs.length && runs[ri].end <= pos) ri++;
      if (ri >= runs.length || runs[ri].start >= to) {
        out.push(<span key={`${keyPrefix}-p${piece++}`}>{text.slice(pos, to)}</span>);
        break;
      }
      const run = runs[ri];
      const rs = Math.max(run.start, pos);
      if (rs > pos) {
        out.push(<span key={`${keyPrefix}-p${piece++}`}>{text.slice(pos, rs)}</span>);
      }
      const re = Math.min(run.end, to);
      out.push(
        <span key={`${keyPrefix}-h${piece++}`} className={run.className}>
          {text.slice(rs, re)}
        </span>,
      );
      pos = re;
    }
  };

  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    if (m.start > cursor) {
      pushText(cursor, m.start, `t${i}-${cursor}`);
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
      out.push(<span key={`s${i}-${m.start}`}>{opts.renderSticker(m, slice, line.stickerUrls)}</span>);
    } else if (opts.renderEmoji) {
      out.push(<span key={`e${i}-${m.start}`}>{opts.renderEmoji(m, slice)}</span>);
    } else {
      out.push(<span key={`e${i}-${m.start}`}>{slice}</span>);
    }
    cursor = m.end;
  }
  if (cursor < text.length) {
    pushText(cursor, text.length, `tail-${cursor}`);
  }
  return out;
}

/** CSS font family for a line (falls back to mono). */
export function lineFont(line: RichLine): string {
  return fontCss(line.font) ?? fontCss('mono') ?? 'inherit';
}
