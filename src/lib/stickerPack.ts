/**
 * Client-safe sticker pack loader with module-level caching + in-flight
 * dedupe, so any number of components (editor picker, composer preview,
 * sticker images) share one request for the lifetime of the page.
 */

export type StickerEntry = {
  token: string;
  url: string | null;
  emoji: string | null;
  label: string;
};

let cached: StickerEntry[] | null = null;
let inflight: Promise<StickerEntry[]> | null = null;

export async function loadStickerPack(): Promise<StickerEntry[]> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = fetch('/api/stickers')
    .then((r) => (r.ok ? r.json() : { stickers: [] }))
    .then((d) => {
      cached = Array.isArray(d.stickers) ? (d.stickers as StickerEntry[]) : [];
      return cached;
    })
    .catch(() => {
      cached = [];
      return cached;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Looks a sticker up by token in a pack (case-insensitive). */
export function findSticker(pack: StickerEntry[] | null | undefined, token: string): StickerEntry | null {
  if (!pack) return null;
  const t = token.trim().toLowerCase();
  return pack.find((p) => p.token.trim().toLowerCase() === t) ?? null;
}
