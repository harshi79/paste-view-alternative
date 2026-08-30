import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { DB } from './db';
import { stickers } from './db/schema';
import type { StickerEntry } from './stickerPack';

const MAX_TOKEN_NAME = 32;

/** Turns a provider label into a readable, canonical sticker token stem. */
export function stickerTokenStem(label: string, fallback = 'gif'): string {
  const words = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+by\s+.+$/g, ' ')
    .replace(/\b(?:gif|animated|animation)\b/g, ' ')
    .replace(/[^a-z0-9_+-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_+]+|[-_+]+$/g, '');
  const safeFallback = fallback.toLowerCase().replace(/[^a-z0-9_+-]+/g, '-') || 'gif';
  return (words || safeFallback).slice(0, MAX_TOKEN_NAME).replace(/[-_+]+$/g, '') || 'gif';
}

/** Deterministic collision sequence: :name:, :name-2:, :name-3:, ... */
export function stickerTokenCandidate(stem: string, attempt: number): string {
  const suffix = attempt <= 1 ? '' : `-${attempt}`;
  const room = MAX_TOKEN_NAME - suffix.length;
  const base = stem.slice(0, room).replace(/[-_+]+$/g, '') || 'gif';
  return `:${base}${suffix}:`;
}

export function firstAvailableStickerToken(label: string, existing: ReadonlySet<string>, fallback = 'gif'): string {
  const stem = stickerTokenStem(label, fallback);
  for (let attempt = 1; attempt <= 9999; attempt++) {
    const token = stickerTokenCandidate(stem, attempt);
    if (!existing.has(token)) return token;
  }
  throw new Error('Could not allocate a unique sticker token.');
}

export type ImportedSticker = StickerEntry & { id: string; createdAt: Date };
export type TrustedStickerAsset = { url: string; label: string; emoji: string | null; fallbackStem: string };

/** Atomically preserve existing tokens while adding a trusted provider asset. */
export async function persistImportedSticker(
  db: DB,
  asset: TrustedStickerAsset,
): Promise<{ sticker: ImportedSticker; existing: boolean }> {
  const [sameAsset] = await db.select().from(stickers).where(eq(stickers.url, asset.url)).limit(1);
  if (sameAsset) return { sticker: sameAsset, existing: true };

  const stem = stickerTokenStem(asset.label, asset.fallbackStem);
  for (let attempt = 1; attempt <= 9999; attempt++) {
    const token = stickerTokenCandidate(stem, attempt);
    const [created] = await db
      .insert(stickers)
      .values({
        id: randomUUID(),
        token,
        url: asset.url,
        emoji: asset.emoji,
        label: asset.label.slice(0, 40),
        createdAt: new Date(),
      })
      .onConflictDoNothing({ target: stickers.token })
      .returning();
    if (created) return { sticker: created, existing: false };
    // A concurrent request for the same provider asset may have won the
    // base-token insert between our initial URL lookup and this attempt.
    const [concurrentAsset] = await db.select().from(stickers).where(eq(stickers.url, asset.url)).limit(1);
    if (concurrentAsset) return { sticker: concurrentAsset, existing: true };
  }
  throw new Error('Could not allocate a unique sticker token.');
}

/** Only HTTPS media URLs returned by Giphy may enter the persistent pack. */
export function isTrustedGiphyGifUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'giphy.com' || url.hostname.endsWith('.giphy.com'));
  } catch {
    return false;
  }
}

/** Only URLs from the server-backed GIF providers may be imported by users. */
export function isTrustedNekoGifUrl(value: string, category: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'nekos.best') return false;
    const prefix = `/api/v2/${encodeURIComponent(category)}/`;
    return url.pathname.startsWith(prefix) && /\.(?:gif|webp)$/i.test(url.pathname);
  } catch {
    return false;
  }
}
