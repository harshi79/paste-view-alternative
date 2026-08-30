import { sql } from 'drizzle-orm';
import { getDb, type DB } from './db';
import { stickers } from './db/schema';
import { isStickerToken } from './statusEmoji';
import type { StickerEntry } from './stickerPack';

/** Resolve one stored status token directly, avoiding stale whole-pack caches. */
export async function loadStickerByToken(token: string, database?: DB): Promise<StickerEntry | null> {
  const canonical = token.trim().toLowerCase();
  if (!isStickerToken(canonical)) return null;
  const db = database ?? await getDb();
  const [row] = await db
    .select({ token: stickers.token, url: stickers.url, emoji: stickers.emoji, label: stickers.label })
    .from(stickers)
    .where(sql`lower(${stickers.token}) = ${canonical}`)
    .limit(1);
  return row ?? null;
}
