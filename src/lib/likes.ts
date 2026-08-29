import { createHash, randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from './db';
import { likes, pastes } from './db/schema';

// ------------------------------------------------------------------
// Like / unlike (there is no dislike).
//
// - Signed-in users: one like per user per paste (user_id).
// - Guests: one like per browser per paste, tracked via a salted
//   SHA-256 hash of their IP (ip_hash) — the raw IP is never stored.
//
// The count doubles as a denormalized counter on `pastes.likes_count`
// so list/profile queries never aggregate the likes table.
// ------------------------------------------------------------------

export type LikeActor = { userId?: string; ipHash?: string | null };

const g = globalThis as unknown as { __vibelikesSalt?: string };

function ipHashOf(ip: string): string {
  // Salt with AUTH_SECRET (or a stable fallback) so raw IPs cannot be
  // reversed from the DB even if it leaks. Keep the salt cached per process.
  let salt = g.__vibelikesSalt;
  if (!salt) {
    salt = process.env.AUTH_SECRET || 'vibebin-dev-secret-do-not-use-in-production-change-me';
    g.__vibelikesSalt = salt;
  }
  return createHash('sha256').update(`${salt}|${ip}`).digest('hex');
}

/** Resolve who is acting: signed-in user id, or an anonymous IP hash. */
export function likeActor(userId: string | undefined | null, ip: string): LikeActor {
  if (userId) return { userId };
  return { ipHash: ipHashOf(ip) };
}

function actorWhere(actor: LikeActor) {
  if (actor.userId) return eq(likes.userId, actor.userId);
  return eq(likes.ipHash, actor.ipHash ?? '');
}

/**
 * Current state for the paste — idempotent read used on page render.
 * Pass `countOverride` when the caller already loaded the paste row
 * (the paste page does) to avoid a duplicate indexed read.
 */
export async function getLikeState(
  pasteId: string,
  actor: LikeActor,
  countOverride?: number,
): Promise<{ count: number; liked: boolean }> {
  const db = await getDb();
  let count = countOverride ?? 0;
  if (countOverride === undefined) {
    const [paste] = await db
      .select({ likesCount: pastes.likesCount })
      .from(pastes)
      .where(eq(pastes.id, pasteId))
      .limit(1);
    count = Math.max(0, paste?.likesCount ?? 0);
  }
  const [row] = await db
    .select({ id: likes.id })
    .from(likes)
    .where(and(eq(likes.pasteId, pasteId), actorWhere(actor)))
    .limit(1);
  return { count, liked: !!row };
}

/**
 * Like a paste. Idempotent: if the actor already liked it, nothing
 * changes. A race between two requests is collapsed by the partial
 * unique index — the counter is only incremented by the winner.
 */
export async function likePaste(
  pasteId: string,
  actor: LikeActor,
): Promise<{ count: number; liked: boolean }> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const exists = await tx
      .select({ id: likes.id })
      .from(likes)
      .where(and(eq(likes.pasteId, pasteId), actorWhere(actor)))
      .limit(1);
    if (exists.length > 0) {
      const [paste] = await tx
        .select({ likesCount: pastes.likesCount })
        .from(pastes)
        .where(eq(pastes.id, pasteId))
        .limit(1);
      return { count: paste?.likesCount ?? 0, liked: true };
    }
    // ON CONFLICT DO NOTHING collapses double-tap races without raising
    // an error (a failed statement would poison the whole transaction).
    const [row] = await tx
      .insert(likes)
      .values({ id: randomUUID(), pasteId, userId: actor.userId ?? null, ipHash: actor.ipHash ?? null, createdAt: new Date() })
      .onConflictDoNothing()
      .returning({ id: likes.id });
    const inserted = !!row;
    if (inserted) {
      await tx
        .update(pastes)
        .set({ likesCount: sql`${pastes.likesCount} + 1` })
        .where(eq(pastes.id, pasteId));
    }
    const [paste] = await tx
      .select({ likesCount: pastes.likesCount })
      .from(pastes)
      .where(eq(pastes.id, pasteId))
      .limit(1);
    return { count: paste?.likesCount ?? 0, liked: inserted };
  });
}

/** Unlike a paste. Idempotent; the counter never goes below zero. */
export async function unlikePaste(
  pasteId: string,
  actor: LikeActor,
): Promise<{ count: number; liked: boolean }> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(likes)
      .where(and(eq(likes.pasteId, pasteId), actorWhere(actor)))
      .returning({ id: likes.id });
    if (removed.length > 0) {
      await tx
        .update(pastes)
        .set({ likesCount: sql`MAX(${pastes.likesCount} - 1, 0)` })
        .where(eq(pastes.id, pasteId));
    }
    const [paste] = await tx
      .select({ likesCount: pastes.likesCount })
      .from(pastes)
      .where(eq(pastes.id, pasteId))
      .limit(1);
    return { count: paste?.likesCount ?? 0, liked: false };
  });
}
