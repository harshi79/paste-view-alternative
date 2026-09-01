import { createHash } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb, type DB } from './db';
import { likes, pastes } from './db/schema';
import {
  HEART_REACTION,
  getReactionCounts,
  getUserReaction,
  removeReaction,
  setReaction,
} from './reactions';

// ------------------------------------------------------------------
// Like compatibility layer (the Like is now the ❤️ reaction).
//
// The `likes` table is NO LONGER a source of truth for anyone's like
// state. All authoritative state lives in `reactions` with ONE row per
// (user_id, paste_id): liking a paste IS selecting the ❤️ reaction,
// unliking IS removing it, and the like count IS the ❤️ count (❤️
// reactions + retained anonymous likes — see src/lib/reactions.ts).
//
// What remains of the legacy table:
//   - ANONYMOUS likes (ip_hash rows, no user id) created before the
//     unification. They cannot be represented as per-user reactions,
//     are never written again, and only keep counting toward ❤️ so no
//     existing like is silently lost. getLikeState still reports one
//     back to a returning anonymous visitor (read-only).
//   - Signed-in like rows were converted to ❤️ reactions and removed
//     from this table by the one-time migration
//     (src/lib/db/migrateReactions.ts) — a like is never stored twice.
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

/**
 * The unified ❤️ count for a paste: ❤️ reactions plus retained anonymous
 * likes. This is THE like count — identical to what the reaction chips
 * and the reactions API report for ❤️.
 */
export async function getHeartCount(pasteId: string, database?: DB): Promise<number> {
  const counts = await getReactionCounts(pasteId, database);
  return counts.find((c) => c.reaction === HEART_REACTION)?.count ?? 0;
}

/** Whether this anonymous actor still holds a retained legacy like row. */
async function hasAnonymousLike(
  pasteId: string,
  ipHash: string | null | undefined,
  database?: DB,
): Promise<boolean> {
  if (!ipHash) return false;
  const db = database ?? (await getDb());
  const [row] = await db
    .select({ id: likes.id })
    .from(likes)
    .where(
      and(eq(likes.pasteId, pasteId), isNull(likes.userId), eq(likes.ipHash, ipHash)),
    )
    .limit(1);
  return !!row;
}

/**
 * Current like state for the paste — idempotent read used by the
 * compatibility endpoint. Delegates to the unified reaction system:
 * `count` is the ❤️ count and `liked` is true when the actor's reaction
 * is ❤️ (for a signed-in user) or when a returning anonymous visitor
 * still holds a retained legacy like row (read-only archive).
 */
export async function getLikeState(
  pasteId: string,
  actor: LikeActor,
): Promise<{ count: number; liked: boolean }> {
  const db = await getDb();
  if (actor.userId) {
    const [count, mine] = await Promise.all([
      getHeartCount(pasteId, db),
      getUserReaction(actor.userId, pasteId, db),
    ]);
    return { count, liked: mine === HEART_REACTION };
  }
  const [count, liked] = await Promise.all([
    getHeartCount(pasteId, db),
    hasAnonymousLike(pasteId, actor.ipHash, db),
  ]);
  return { count, liked };
}

/**
 * Like a paste — delegates to the unified reaction system by selecting
 * the ❤️ reaction (creating it, or replacing the actor's current
 * reaction). No second record is ever written: there is no insert into
 * `likes`. Signed-in actors only; anonymous liking ended with the
 * unification (the API layer rejects guests with 401 — the same
 * members-only rule as the reactions API).
 *
 * `newlyLiked` is true when the actor's reaction BECAME ❤️ with this
 * call (first like, or a switch from another reaction) — the signal the
 * caller uses for the existing like notification.
 */
export async function likePaste(
  pasteId: string,
  actor: LikeActor,
): Promise<{ count: number; liked: boolean; newlyLiked: boolean }> {
  const db = await getDb();
  if (!actor.userId) {
    const count = await getHeartCount(pasteId, db);
    return { count, liked: false, newlyLiked: false };
  }
  const result = await setReaction(actor.userId, pasteId, HEART_REACTION);
  const [paste] = await db
    .select({ likesCount: pastes.likesCount })
    .from(pastes)
    .where(eq(pastes.id, pasteId))
    .limit(1);
  return {
    count: Math.max(0, paste?.likesCount ?? 0),
    liked: true,
    newlyLiked: result.previous !== HEART_REACTION,
  };
}

/**
 * Unlike a paste — delegates to the unified reaction system by removing
 * the actor's ❤️ reaction. When the actor's current reaction is NOT ❤️
 * (e.g. they switched to 🔥), unliking does nothing to it: an unlike
 * only ever removes ❤️. Signed-in actors only.
 */
export async function unlikePaste(
  pasteId: string,
  actor: LikeActor,
): Promise<{ count: number; liked: boolean }> {
  const db = await getDb();
  if (!actor.userId) {
    const count = await getHeartCount(pasteId, db);
    return { count, liked: false };
  }
  if ((await getUserReaction(actor.userId, pasteId, db)) === HEART_REACTION) {
    await removeReaction(actor.userId, pasteId);
  }
  const [paste] = await db
    .select({ likesCount: pastes.likesCount })
    .from(pastes)
    .where(eq(pastes.id, pasteId))
    .limit(1);
  return { count: Math.max(0, paste?.likesCount ?? 0), liked: false };
}
