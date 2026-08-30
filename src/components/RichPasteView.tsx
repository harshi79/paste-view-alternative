import type { RichDoc, RichLine } from '@/lib/pasteFormat';
import { splitLine, lineFont } from './richRender';
import StickerImage from './StickerImage';

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
    <div className="overflow-hidden rounded-[26px] border border-white/10 bg-[#060912]/85 shadow-[0_28px_60px_-40px_rgba(0,0,0,0.92)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-black/20 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="window-dots" aria-hidden="true">
            <span className="window-dot bg-rose-400/80" />
            <span className="window-dot bg-amber-400/80" />
            <span className="window-dot bg-emerald-400/80" />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">Rendered paste</p>
            <p className="text-[11px] text-zinc-500">Rich lines, inline stickers, and linked URLs in one clean view.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400">
          <span className="pill">Rich content</span>
          <span className="pill">{doc.lines.length.toLocaleString()} lines</span>
        </div>
      </div>

      <div className="overflow-x-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.015),transparent_30%)] px-3 py-4 md:px-4">
        {doc.lines.length === 0 ? (
          <p className="px-2 py-1 text-sm italic text-zinc-500">(empty paste)</p>
        ) : (
          doc.lines.map((line, i) => (
            <div key={i} className="grid grid-cols-[auto_1fr] gap-4 rounded-xl px-2 py-1.5">
              <span aria-hidden className="pt-1 text-right font-mono text-[11px] text-zinc-600">
                {i + 1}
              </span>
              <RichLine line={line} stickers={stickers} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function RichLine({ line, stickers }: { line: RichLine; stickers?: StickerPackEntry[] }) {
  const segments = splitLine(line, {
    renderSticker: (mark, slice, stickerUrls) => (
      <StickerImage
        token={mark.value}
        fallback={slice}
        pack={stickers}
        url={stickerUrls?.[mark.value]}
      />
    ),
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
