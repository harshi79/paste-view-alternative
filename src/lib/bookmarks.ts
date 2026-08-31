import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { getDb } from './db';
import { bookmarks, pastes, profiles, users } from './db/schema';
import { clampLimit, decodeCursor, encodeCursor } from './notifications';

// ------------------------------------------------------------------
// Bookmarks — signed-in users saving posts for later.
//
// - One row per (user, paste): the composite primary key makes duplicate
//   bookmarks impossible at the DB level, and inserts use ON CONFLICT DO
//   NOTHING so a repeated bookmark is a safe no-op (same idempotency
//   pattern as src/lib/likes.ts and src/lib/follows.ts).
// - Guests can never bookmark: there is no anonymous/IP actor here (that
//   is the deliberate difference from likes). The API layer returns 401
//   before any library function is reached, and every function below is
//   scoped to the session's own user id — there is no code path that
//   reads or writes another user's bookmarks.
// - Removing a bookmark deletes the row permanently (no soft-delete);
//   deleting a paste or a user cascades their bookmarks away.
// - The saved-posts listing is keyset-paginated (never an unbounded
//   read) and skips expired pastes, matching how profile listings
//   filter them; the paste itself still 404s/expires on its own page.
//
// The cursor and limit helpers (`encodeCursor`, `decodeCursor`,
// `clampLimit`) are the same generic, already-exported utilities the
// notification history uses — same `<createdAtMs>_<id>` cursor format,
// same 20/50 page-size bounds — so both feeds behave identically.
// Bookmarks have no surrogate id column, so the unique paste id doubles
// as the cursor tiebreaker (the composite PK guarantees its uniqueness
// per user).
// ------------------------------------------------------------------

export type BookmarkedPasteRow = {
  pasteId: string;
  title: string;
  titleColor: string | null;
  language: string;
  visibility: string;
  pinned: boolean;
  views: number;
  likesCount: number;
  hasPassword: boolean;
  /** Paste creation time, epoch ms. */
  createdAt: number;
  /** When the user saved the post, epoch ms. */
  savedAt: number;
  author: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
};

export type BookmarkedPastePage = {
  bookmarks: BookmarkedPasteRow[];
  nextCursor: string | null;
  hasMore: boolean;
};

/** Whether `userId` has bookmarked `pasteId` (single indexed PK read). */
export async function isBookmarked(userId: string, pasteId: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ pasteId: bookmarks.pasteId })
    .from(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.pasteId, pasteId)))
    .limit(1);
  return !!row;
}

/**
 * Bookmark a paste for a user. Idempotent: bookmarking an already-saved
 * paste is a no-op collapsed by the composite PK + ON CONFLICT DO
 * NOTHING, so a double-click or raced retry can never create duplicates.
 * `created` reports whether THIS call inserted the row.
 */
export async function bookmarkPaste(
  userId: string,
  pasteId: string,
): Promise<{ bookmarked: boolean; created: boolean }> {
  const db = await getDb();
  const [row] = await db
    .insert(bookmarks)
    .values({ userId, pasteId, createdAt: new Date() })
    .onConflictDoNothing()
    .returning({ pasteId: bookmarks.pasteId });
  return { bookmarked: true, created: !!row };
}

/**
 * Remove a bookmark permanently. Idempotent: removing a bookmark that
 * does not exist is a no-op (`removed` is false). The WHERE clause is
 * keyed on the caller's own user id, so one user can never delete
 * another user's bookmark.
 */
export async function unbookmarkPaste(
  userId: string,
  pasteId: string,
): Promise<{ bookmarked: boolean; removed: boolean }> {
  const db = await getDb();
  const removed = await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.userId, userId), eq(bookmarks.pasteId, pasteId)))
    .returning({ pasteId: bookmarks.pasteId });
  return { bookmarked: false, removed: removed.length > 0 };
}

/**
 * Newest-first page of one user's saved posts (most recently saved
 * first). `limit` is always clamped server-side; `cursor` is the
 * `nextCursor` returned by the previous page. The join is on the
 * bookmarked paste only (plus its author for display) — expired pastes
 * are filtered out, and there is deliberately no visibility filter:
 * saving an unlisted paste just remembers a link the user already had.
 */
export async function listBookmarkedPastes(
  userId: string,
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<BookmarkedPastePage> {
  const db = await getDb();
  const limit = clampLimit(opts.limit);
  const cursor = decodeCursor(opts.cursor);

  const conditions = [
    eq(bookmarks.userId, userId),
    sql`(${pastes.expiresAt} is null or ${pastes.expiresAt} > ${Date.now()})`,
  ];
  if (cursor) {
    const cursorDate = new Date(cursor.createdAt);
    conditions.push(
      or(
        lt(bookmarks.createdAt, cursorDate),
        and(eq(bookmarks.createdAt, cursorDate), lt(bookmarks.pasteId, cursor.id)),
      )!,
    );
  }

  const rows = await db
    .select({
      savedAt: bookmarks.createdAt,
      pasteId: pastes.id,
      title: pastes.title,
      titleColor: pastes.titleColor,
      language: pastes.language,
      visibility: pastes.visibility,
      pinned: pastes.pinned,
      views: pastes.views,
      likesCount: pastes.likesCount,
      hasPassword: pastes.passwordHash,
      createdAt: pastes.createdAt,
      authorUsername: users.username,
      authorDisplayName: profiles.displayName,
      authorAvatarUrl: profiles.avatarUrl,
    })
    .from(bookmarks)
    .innerJoin(pastes, eq(bookmarks.pasteId, pastes.id))
    .leftJoin(users, eq(pastes.userId, users.id))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(bookmarks.createdAt), desc(bookmarks.pasteId))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const mapped: BookmarkedPasteRow[] = page.map((r) => ({
    pasteId: r.pasteId,
    title: r.title,
    titleColor: r.titleColor,
    language: r.language,
    visibility: r.visibility,
    pinned: !!r.pinned,
    views: r.views,
    likesCount: r.likesCount ?? 0,
    hasPassword: !!r.hasPassword,
    createdAt: r.createdAt.getTime(),
    savedAt: r.savedAt.getTime(),
    author: r.authorUsername
      ? {
          username: r.authorUsername,
          displayName: r.authorDisplayName ?? null,
          avatarUrl: r.authorAvatarUrl ?? null,
        }
      : null,
  }));

  const last = page[page.length - 1];
  return {
    bookmarks: mapped,
    nextCursor:
      hasMore && last
        ? encodeCursor({ createdAt: last.savedAt.getTime(), id: last.pasteId })
        : null,
    hasMore,
  };
}
