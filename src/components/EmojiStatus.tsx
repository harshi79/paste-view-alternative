'use client';

import type { StickerEntry } from '@/lib/stickerPack';
import { isStickerToken } from '@/lib/statusEmoji';
import StickerImage from './StickerImage';

type Props = {
  value: string | null | undefined;
  pack?: StickerEntry[] | null;
  className?: string;
  imageClassName?: string;
  title?: string;
  ariaHidden?: boolean;
};

/** One renderer for Unicode and persistent sticker-token profile statuses. */
export default function EmojiStatus({
  value,
  pack,
  className,
  imageClassName = 'status-emoji-asset',
  title,
  ariaHidden = false,
}: Props) {
  const status = String(value ?? '').trim();
  if (!status) return null;

  return (
    <span className={className} title={title} aria-hidden={ariaHidden || undefined}>
      {isStickerToken(status) ? (
        <StickerImage token={status} fallback="" pack={pack} className={imageClassName} />
      ) : (
        status
      )}
    </span>
  );
}
