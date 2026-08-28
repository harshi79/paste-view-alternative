'use client';

import { useEffect, useState } from 'react';

type Pack = { token: string; url: string | null; emoji: string | null };

let cachedPack: Pack[] | null = null;
let inflight: Promise<Pack[]> | null = null;

async function loadPack(): Promise<Pack[]> {
  if (cachedPack) return cachedPack;
  if (inflight) return inflight;
  inflight = fetch('/api/stickers')
    .then((r) => (r.ok ? r.json() : { stickers: [] }))
    .then((d) => (cachedPack = d.stickers as Pack[]))
    .catch(() => (cachedPack = []));
  return inflight;
}

/** Renders a sticker by token. Shows the typed text until the pack loads. */
export default function StickerSpan({ token, fallback }: { token: string; fallback: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [emoji, setEmoji] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPack().then((pack) => {
      if (cancelled) return;
      const hit = pack.find((p) => p.token === token);
      if (hit?.url) setSrc(hit.url);
      else if (hit?.emoji) setEmoji(hit.emoji);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={fallback}
        className="mx-0.5 inline-block h-6 w-6 align-[-3px]"
        loading="lazy"
        title={token}
      />
    );
  }
  if (emoji) {
    return <span title={token}>{emoji}</span>;
  }
  return <span title={token}>{fallback}</span>;
}
