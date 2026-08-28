import { and, eq, isNotNull, lt, sql } from 'drizzle-orm';
import { customAlphabet } from 'nanoid';
import { getDb, type DB } from './db';
import { pastes } from './db/schema';

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

export function isExpired(p: { expiresAt: Date | null }): boolean {
  return !!p.expiresAt && p.expiresAt.getTime() <= Date.now();
}

export async function incrementPasteViews(id: string) {
  const db = await getDb();
  await db
    .update(pastes)
    .set({ views: sql`${pastes.views} + 1` })
    .where(eq(pastes.id, id));
}
