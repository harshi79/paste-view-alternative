import { and, desc, eq, gt, gte, inArray, isNull, lt, or } from 'drizzle-orm';
import { getDb } from './db';
import { bookmarks, pastes, profiles, users } from './db/schema';
import { clampLimit, decodeCursor, encodeCursor } from './notifications';
import { pastePreview } from './pasteFormat';
import { retentionCutoff } from './pastes';
import { getReactionState, type ReactionCount } from './reactions';

/**
 * Latest discovery feed — chronological, newest first.
 *
 * This is NOT a trending/popularity ranking. Eligible pastes are public,
 * unprotected, not expired, and inside the existing retention window.
 * Ordering is strictly `created_at DESC` (paste id DESC as a stable
 * tiebreaker). Pagination reuses the notifications/bookmarks keyset
 * cursor helpers so pages never skip or duplicate rows.
 */

export const LATEST_PAGE_SIZE = 12;

export type LatestPasteCard = {
  id: string;
  title: string;
  titleColor: string | null;
  language: string;
  views: number;
  likesCount: number;
  createdAt: number;
  expiresAt: number | null;
  pinned: boolean;
  preview: string;
  author: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
  reactionCounts: ReactionCount[];
  mineReaction: string | null;
  bookmarked: boolean;
};

export type LatestPastePage = {
  pastes: LatestPasteCard[];
  nextCursor: string | null;
  hasMore: boolean;
};

function eligibleConditions(now: Date) {
  return [
    eq(pastes.visibility, 'public'),
    isNull(pastes.passwordHash),
    or(isNull(pastes.expiresAt), gt(pastes.expiresAt, now))!,
    gte(pastes.createdAt, retentionCutoff(now.getTime())),
  ];
}

/**
 * Newest-first page of public discovery pastes.
 *
 * `viewerId` is the signed-in user's id from the session (never a
 * client-supplied user id). Guests pass null — `mineReaction` and
 * `bookmarked` stay false/null. `limit` is clamped server-side.
 */
export async function listLatestPastes(
  opts: { limit?: number; cursor?: string | null; viewerId?: string | null } = {},
): Promise<LatestPastePage> {
  const db = await getDb();
  const limit = clampLimit(opts.limit, LATEST_PAGE_SIZE);
  const cursor = decodeCursor(opts.cursor);
  const now = new Date();
  const viewerId = opts.viewerId ?? null;

  const conditions = [...eligibleConditions(now)];
  if (cursor) {
    const cursorDate = new Date(cursor.createdAt);
    conditions.push(
      or(
        lt(pastes.createdAt, cursorDate),
        and(eq(pastes.createdAt, cursorDate), lt(pastes.id, cursor.id)),
      )!,
    );
  }

  const rows = await db
    .select({
      id: pastes.id,
      title: pastes.title,
      titleColor: pastes.titleColor,
      language: pastes.language,
      views: pastes.views,
      likesCount: pastes.likesCount,
      createdAt: pastes.createdAt,
      expiresAt: pastes.expiresAt,
      pinned: pastes.pinned,
      format: pastes.format,
      content: pastes.content,
      authorUsername: users.username,
      authorDisplayName: profiles.displayName,
      authorAvatarUrl: profiles.avatarUrl,
    })
    .from(pastes)
    .leftJoin(users, eq(pastes.userId, users.id))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(pastes.createdAt), desc(pastes.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const ids = page.map((row) => row.id);

  const [reactionStates, bookmarkIds] = await Promise.all([
    Promise.all(ids.map((id) => getReactionState(id, viewerId, db))),
    viewerId && ids.length > 0
      ? db
          .select({ pasteId: bookmarks.pasteId })
          .from(bookmarks)
          .where(and(eq(bookmarks.userId, viewerId), inArray(bookmarks.pasteId, ids)))
      : Promise.resolve([] as { pasteId: string }[]),
  ]);

  const bookmarked = new Set(bookmarkIds.map((row) => row.pasteId));

  const mapped: LatestPasteCard[] = page.map((row, index) => ({
    id: row.id,
    title: row.title,
    titleColor: row.titleColor,
    language: row.language,
    views: row.views,
    likesCount: row.likesCount ?? 0,
    createdAt: row.createdAt.getTime(),
    expiresAt: row.expiresAt ? row.expiresAt.getTime() : null,
    pinned: !!row.pinned,
    preview: pastePreview(row.format, row.content),
    author: row.authorUsername
      ? {
          username: row.authorUsername,
          displayName: row.authorDisplayName ?? null,
          avatarUrl: row.authorAvatarUrl ?? null,
        }
      : null,
    reactionCounts: reactionStates[index]?.counts ?? [],
    mineReaction: reactionStates[index]?.mine ?? null,
    bookmarked: bookmarked.has(row.id),
  }));

  const last = mapped[mapped.length - 1];
  return {
    pastes: mapped,
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
    hasMore,
  };
}
