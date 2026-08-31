'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildInlineMarks, type RichLine } from '@/lib/pasteFormat';
import { splitLine } from './richRender';
import StickerImage from './StickerImage';
import { loadStickerPack, type StickerEntry } from '@/lib/stickerPack';

type Props = {
  text: string;
  /** Pre-loaded sticker pack (composer preview). Falls back to the shared loader. */
  pack?: StickerEntry[] | null;
};

/**
 * One plain-text line becomes a RichLine whose marks are produced by the
 * exact same detector the unified paste editor uses (`buildInlineMarks`):
 * sticker-pack tokens (`:wave:`) → sticker marks, emoji shortcuts → emoji
 * marks, and URLs → link marks. `splitLine` then renders those marks the
 * same way a paste line renders them, so nothing about stickers, emoji or
 * links is a second implementation — this is the existing pipeline fed
 * with a plain-text message.
 */
function messageLines(text: string, tokens: ReadonlySet<string>): RichLine[] {
  return text.split('\n').map((lineText) => ({
    text: lineText,
    marks: buildInlineMarks(lineText, tokens),
  }));
}

/**
 * Renders a plain broadcast message (admin broadcast `message` body) using
 * the existing VibeBin text/sticker/link rendering pipeline:
 *
 *   - `:wave:` and other sticker tokens resolve exactly like in a paste
 *     (sticker image from the pack, otherwise the emoji shortcut);
 *   - URLs become clickable links — only what `detectLinks` matches
 *     (http/https/www/mailto/tel), so `javascript:` / `data:` and other
 *     unsafe schemes can never become an href; everything is rendered as
 *     plain React nodes, never raw HTML;
 *   - line breaks and normal text are preserved.
 */
export default function BroadcastMessage({ text, pack }: Props) {
  const [loaded, setLoaded] = useState<StickerEntry[] | null>(pack ?? null);

  useEffect(() => {
    if (pack) {
      setLoaded(pack);
      return;
    }
    let cancelled = false;
    loadStickerPack().then((p) => {
      if (!cancelled) setLoaded(p);
    });
    return () => {
      cancelled = true;
    };
  }, [pack]);

  // Same case-sensitive token set the editor builds from the pack.
  const tokens = useMemo(() => new Set((loaded ?? []).map((s) => s.token)), [loaded]);
  const lines = useMemo(() => messageLines(text, tokens), [text, tokens]);

  if (lines.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        const segments = splitLine(line, {
          renderSticker: (mark, slice, stickerUrls) => (
            <StickerImage
              token={mark.value}
              fallback={slice}
              pack={loaded}
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
          <p key={i} className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">
            {segments.length > 0 ? segments : <br />}
          </p>
        );
      })}
    </div>
  );
}
