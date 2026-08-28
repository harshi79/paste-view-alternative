import type { RichDoc, RichLine } from '@/lib/pasteFormat';
import { fontCss } from '@/lib/pasteFormat';
import StickerSpan from './StickerSpan';

type Props = { doc: RichDoc };

/**
 * Server component: renders a rich paste. Links are clickable, never
 * previewed; stickers/emoji are rendered as tokens inline; lines can
 * override font, size, and color.
 */
export default function RichPasteView({ doc }: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-night-900/80">
      <div className="overflow-x-auto px-5 py-4 leading-7">
        {doc.lines.length === 0 ? (
          <p className="text-sm italic text-zinc-500">(empty paste)</p>
        ) : (
          doc.lines.map((line, i) => <RichLine key={i} line={line} />)
        )}
      </div>
    </div>
  );
}

function RichLine({ line }: { line: RichLine }) {
  const font = fontCss(line.font) ?? fontCss('mono');
  const segments = splitLine(line);
  return (
    <div
      className="whitespace-pre-wrap break-words"
      style={{
        fontFamily: font,
        fontSize: line.size ? `${line.size}px` : '14px',
        color: line.color ?? '#dbe1f1',
      }}
    >
      {segments}
    </div>
  );
}

function splitLine(line: RichLine): React.ReactNode[] {
  const text = line.text;
  const marks = (line.marks ?? []).slice().sort((a, b) => a.start - b.start);
  const out: React.ReactNode[] = [];
  let cursor = 0;

  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    if (m.start < cursor || m.end > text.length) continue;
    if (m.start > cursor) {
      out.push(
        <span key={`t${i}-${cursor}`}>{text.slice(cursor, m.start)}</span>,
      );
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
      out.push(<StickerSpan key={`s${i}-${m.start}`} token={m.value} fallback={slice} />);
    } else {
      out.push(
        <span key={`e${i}-${m.start}`} className="text-[1.05em]">
          {m.value}
        </span>,
      );
    }
    cursor = m.end;
  }
  if (cursor < text.length) {
    out.push(<span key={`tail-${cursor}`}>{text.slice(cursor)}</span>);
  }
  return out;
}
