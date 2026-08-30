'use client';

import type { RichDoc } from '@/lib/pasteFormat';
import type { StickerEntry } from '@/lib/stickerPack';
import RichPasteView from './RichPasteView';

type Props = {
  doc: RichDoc;
  language: string;
  pack: StickerEntry[];
};

/**
 * Composer live preview. Renders the unified doc through the SAME rich
 * renderer the final paste page uses (bare mode — no window chrome), so
 * what the author sees includes the language-driven syntax highlighting.
 *
 * This module is only ever loaded via `next/dynamic` with `ssr: false`
 * when the author opens the preview panel (see Editor), which keeps
 * highlight.js and the grammars out of the editor's initial bundle —
 * the editable contentEditable surface itself is untouched.
 */
export default function RichPreview({ doc, language, pack }: Props) {
  return <RichPasteView doc={doc} stickers={pack} language={language} bare />;
}
