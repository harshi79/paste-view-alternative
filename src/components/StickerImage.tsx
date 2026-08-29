'use client';

import { useEffect, useState } from 'react';
import { loadStickerPack, findSticker, type StickerEntry } from '@/lib/stickerPack';

type Props = {
  token: string;
  fallback: string;
  /** Optional pre-loaded pack (e.g. from the editor). Falls back to the shared loader. */
  pack?: StickerEntry[] | null;
};

/**
 * Client-side inline sticker renderer (used by the composer preview).
 * Renders the sticker image/GIF when the pack resolves — never the raw
 * shortcode unless the sticker is unknown.
 */
export default function StickerImage({ token, fallback, pack }: Props) {
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
  }, [pack, token]);

  const hit = findSticker(loaded, token);
  if (hit?.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={hit.url}
        alt={hit.label || token}
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
  return <span>{fallback}</span>;
}
