import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from './db';
import { follows, pastes, profiles, tags, userTags, users } from './db/schema';

// ------------------------------------------------------------------
// Follow system.
//
// - One directed row per relationship (follower -> following).
// - Uniqueness is enforced by the composite primary key; duplicate
//   follows are collapsed with ON CONFLICT DO NOTHING (idempotent).
// - Self-follows are rejected by the API layer and throw here as a
//   backstop.
// - Counts are computed with indexed COUNT queries (no denormalized
//   counter to drift out of sync).
// ------------------------------------------------------------------

export type FollowListEntry = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  statusEmoji: string;
  statusText: string;
  tags: { id: string; label: string; color: string; effect: string | null }[];
  isFollowing: boolean;
};

/** Whether `followerId` currently follows `followingId`. */
export async function isFollowingUser(followerId: string, followingId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ followerId: follows.followerId })
    .from(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
    .limit(1);
  return !!row;
}

/** Follower + following counts for one user (indexed COUNT queries). */
export async function getFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
  const db = await getDb();
  const [followersRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(follows)
    .where(eq(follows.followingId, userId));
  const [followingRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(follows)
    .where(eq(follows.followerId, userId));
  return {
    followers: Number(followersRow?.n ?? 0),
    following: Number(followingRow?.n ?? 0),
  };
}

/**
 * Follow a user. Idempotent: following someone you already follow is a
 * no-op (the composite PK + ON CONFLICT DO NOTHING collapses duplicates).
 * Self-follow throws SELF_FOLLOW — the API route rejects it with 400
 * before this is ever reached.
 */
export async function followUser(
  followerId: string,
  followingId: string,
): Promise<{ following: boolean; followersCount: number }> {
  if (followerId === followingId) throw new Error('SELF_FOLLOW');
  const db = await getDb();
  const [row] = await db
    .insert(follows)
    .values({ followerId, followingId, createdAt: new Date() })
    .onConflictDoNothing()
    .returning({ followerId: follows.followerId });
  const { followers } = await getFollowCounts(followingId);
  return { following: !!row, followersCount: followers };
}

/** Unfollow a user. Idempotent: removing a non-existent follow is a no-op. */
export async function unfollowUser(
  followerId: string,
  followingId: string,
): Promise<{ following: boolean; followersCount: number }> {
  const db = await getDb();
  await db
    .delete(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
  const { followers } = await getFollowCounts(followingId);
  return { following: false, followersCount: followers };
}

/**
 * Followers or following list for a profile. Single indexed join per
 * list, plus one grouped tags query — no per-user N+1. `viewerId` is the
 * signed-in viewer (if any); its follow state is resolved with one
 * EXISTS per row inside the same query.
 */
export async function getFollowList(
  targetUserId: string,
  kind: 'followers' | 'following',
  viewerId: string | null,
): Promise<FollowListEntry[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
      statusEmoji: profiles.statusEmoji,
      statusText: profiles.statusText,
      isFollowing: sql<number>`exists(
        select 1 from follows f2
        where f2.follower_id = ${viewerId ?? ''}
          and f2.following_id = ${users.id}
      )`,
    })
    .from(follows)
    .innerJoin(
      users,
      kind === 'followers' ? eq(follows.followerId, users.id) : eq(follows.followingId, users.id),
    )
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(kind === 'followers' ? eq(follows.followingId, targetUserId) : eq(follows.followerId, targetUserId))
    .orderBy(desc(follows.createdAt))
    .limit(100);

  const userIds = rows.map((r) => r.id);
  const tagRows =
    userIds.length > 0
      ? await db
          .select({
            userId: userTags.userId,
            id: tags.id,
            label: tags.label,
            color: tags.color,
            effect: tags.effect,
          })
          .from(userTags)
          .innerJoin(tags, eq(userTags.tagId, tags.id))
          .where(inArray(userTags.userId, userIds))
      : [];
  const tagsByUser = new Map<string, FollowListEntry['tags']>();
  for (const t of tagRows) {
    const list = tagsByUser.get(t.userId) ?? [];
    list.push({ id: t.id, label: t.label, color: t.color, effect: t.effect });
    tagsByUser.set(t.userId, list);
  }

  return rows.map((r) => ({
    username: r.username,
    displayName: r.displayName ?? null,
    avatarUrl: r.avatarUrl ?? null,
    statusEmoji: r.statusEmoji ?? '',
    statusText: r.statusText ?? '',
    tags: tagsByUser.get(r.id) ?? [],
    isFollowing: Number(r.isFollowing) === 1,
  }));
}

/** Public (non-expired) paste count for a user — used in profile summaries. */
export async function countPublicPastes(userId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(pastes)
    .where(
      and(
        eq(pastes.userId, userId),
        eq(pastes.visibility, 'public'),
        sql`(${pastes.expiresAt} is null or ${pastes.expiresAt} > ${Date.now()})`,
      ),
    );
  return Number(row?.n ?? 0);
}
