import type { RichDoc, RichLine, InlineMark } from '@/lib/pasteFormat';
import { findSticker } from '@/lib/stickerPack';
import { splitLine, lineFont } from './richRender';

export type StickerPackEntry = {
  token: string;
  url: string | null;
  emoji: string | null;
  label: string;
};

type Props = { doc: RichDoc; stickers?: StickerPackEntry[] };

/**
 * Server component: renders a rich paste. Links are clickable, never
 * previewed; stickers/emoji render as inline images with no shortcode
 * text visible. The sticker pack is passed from the server so the page
 * needs no extra client fetch or flash of `:wave:` text.
 */
export default function RichPasteView({ doc, stickers }: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-night-900/80">
      <div className="overflow-x-auto px-5 py-4 leading-7">
        {doc.lines.length === 0 ? (
          <p className="text-sm italic text-zinc-500">(empty paste)</p>
        ) : (
          doc.lines.map((line, i) => <RichLine key={i} line={line} stickers={stickers} />)
        )}
      </div>
    </div>
  );
}

function RichLine({ line, stickers }: { line: RichLine; stickers?: StickerPackEntry[] }) {
  const segments = splitLine(line, {
    renderSticker: (mark, slice) => <StickerImg mark={mark} slice={slice} stickers={stickers} />,
    renderEmoji: (mark) => (
      <span className="text-[1.05em]" title={mark.value}>
        {mark.value}
      </span>
    ),
  });
  return (
    <div
      className="whitespace-pre-wrap break-words"
      style={{
        fontFamily: lineFont(line),
        fontSize: line.size ? `${line.size}px` : '14px',
        color: line.color ?? '#dbe1f1',
      }}
    >
      {segments}
    </div>
  );
}

/** Pure markup — no hooks, so it stays renderable by the server. */
function StickerImg({
  mark,
  slice,
  stickers,
}: {
  mark: InlineMark;
  slice: string;
  stickers?: StickerPackEntry[];
}) {
  const hit = findSticker(stickers ?? null, mark.value);
  if (hit?.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={hit.url}
        alt={hit.label || mark.value}
        title={hit.label || hit.token}
        loading="lazy"
        decoding="async"
        className="paste-sticker"
      />
    );
  }
  if (hit?.emoji) {
    return <span title={hit.label || hit.token}>{hit.emoji}</span>;
  }
  // Unknown sticker: keep the original text so nothing is lost.
  return <span>{slice}</span>;
}
