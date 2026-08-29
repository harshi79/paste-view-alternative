import { and, eq, isNotNull, lt, sql } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';
import { getDb, type DB } from './db';
import { pastes } from './db/schema';
import { getClientIp } from './ip';

const nanoid = customAlphabet('0123456789abcdefghjkmnpqrstuvwxyz', 8);

export { EXPIRY_OPTIONS, expiryFromId, isExpiredDate } from './expiry';
export type { ExpiryId } from './expiry';

export async function generatePasteId(db?: DB): Promise<string> {
  const database: DB = db ?? (await getDb());
  for (let i = 0; i < 5; i++) {
    const id = nanoid();
    const [existing] = await database
      .select({ id: pastes.id })
      .from(pastes)
      .where(eq(pastes.id, id))
      .limit(1);
    if (!existing) return id;
  }
  // Astronomically unlikely; add a time suffix as a last resort.
  return nanoid() + Date.now().toString(36).slice(-4);
}

/** Permanently removes expired pastes (lazy cleanup, cheap thanks to the index). */
export async function purgeExpired(db: DB) {
  await db
    .delete(pastes)
    .where(and(isNotNull(pastes.expiresAt), lt(pastes.expiresAt, new Date())));
}

const PURGE_INTERVAL_MS = 5 * 60 * 1000;
const purgeG = globalThis as unknown as { __vibepurge?: number };

/**
 * Purge is idempotent, so running it on every page view is wasted work —
 * at most once per process every 5 minutes is plenty (expired pastes are
 * also filtered lazily on read by the viewer).
 */
export async function purgeExpiredIfDue(db: DB): Promise<void> {
  const last = purgeG.__vibepurge ?? 0;
  const now = Date.now();
  if (now - last < PURGE_INTERVAL_MS) return;
  purgeG.__vibepurge = now;
  await purgeExpired(db);
}

export function isExpired(p: { expiresAt: Date | null }): boolean {
  return !!p.expiresAt && p.expiresAt.getTime() <= Date.now();
}

// Lightweight dedup: prevents the same IP from double-counting a paste
// within a 3-second window (covers rapid refreshes / double-taps).
const dedupG = globalThis as unknown as { __vibeviewDedup?: Map<string, number> };
const VIEW_DEDUP_MS = 3000;

function dedupKey(pasteId: string, ip: string): string {
  return `${pasteId}:${ip}`;
}

/**
 * Increment the view counter for a paste, with a short dedup window so
 * rapid refreshes from the same visitor don't inflate the count.
 */
export async function incrementPasteViews(id: string) {
  const db = await getDb();

  // getClientIp() uses next/headers which is only available inside
  // request handlers. In other contexts (tests, scripts) it will throw
  // — fall back to a placeholder so the view counter still fires.
  let visitorIp = '0.0.0.0';
  try {
    visitorIp = await getClientIp();
  } catch {
    // not in a request context — keep the fallback
  }

  const now = Date.now();
  const map = dedupG.__vibeviewDedup ?? (dedupG.__vibeviewDedup = new Map());
  const key = dedupKey(id, visitorIp);
  const last = map.get(key) ?? 0;
  if (now - last < VIEW_DEDUP_MS) return;
  map.set(key, now);

  await db
    .update(pastes)
    .set({ views: sql`${pastes.views} + 1` })
    .where(eq(pastes.id, id));
}
