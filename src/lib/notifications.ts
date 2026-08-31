import { randomUUID } from 'node:crypto';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import { getDb, type DB } from './db';
import { follows, notifications, profiles, users } from './db/schema';

// ------------------------------------------------------------------
// Notification backend.
//
// One row per recipient per event. Types are stable internal
// identifiers (never UI strings):
//
//   FOLLOW    — someone followed you            (actor, no paste)
//   LIKE      — someone liked your paste        (actor + paste)
//   NEW_POST  — someone you follow posted       (actor + paste)
//   ADMIN     — administrator broadcast         (no actor, no paste)
//
// Idempotency is a DB concern: every event carries a `dedupeKey` and the
// unique index `notifications_dedupe_idx` collapses repeats (repeated
// follow, repeated like, the same post fanned out twice). Inserts use
// ON CONFLICT DO NOTHING so a duplicate never raises — a failed
// statement would poison the surrounding transaction (same pattern as
// src/lib/likes.ts).
//
// Notifications are always written AFTER the core operation
// (follow/like/paste insert) has already succeeded and OUTSIDE its
// transaction, so a notification failure can never roll back or change
// the meaning of the operation the user actually performed.
// ------------------------------------------------------------------

export const NOTIFICATION_TYPES = ['FOLLOW', 'LIKE', 'NEW_POST', 'ADMIN'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;
export const DEFAULT_LATEST_SIZE = 8;

/** Rows written per multi-row INSERT during new-post fanout. */
const FANOUT_CHUNK = 500;

export type NotificationRow = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  pasteId: string | null;
  isRead: boolean;
  createdAt: number; // epoch ms — JSON friendly, newest-first sortable
  actor: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
};

export type NotificationPage = {
  notifications: NotificationRow[];
  nextCursor: string | null;
  hasMore: boolean;
};

type NewNotification = {
  recipientUserId: string;
  type: NotificationType;
  actorUserId?: string | null;
  pasteId?: string | null;
  title: string;
  message?: string;
  link?: string | null;
  dedupeKey: string | null;
};

// ------------------------------------------------------------------
// Writes
// ------------------------------------------------------------------

function toValues(input: NewNotification) {
  return {
    id: randomUUID(),
    recipientUserId: input.recipientUserId,
    type: input.type,
    actorUserId: input.actorUserId ?? null,
    pasteId: input.pasteId ?? null,
    title: input.title,
    message: input.message ?? '',
    link: input.link ?? null,
    dedupeKey: input.dedupeKey,
    isRead: false,
    createdAt: new Date(),
  };
}

/**
 * Insert one notification. Returns true when a row was actually created
 * (false when the dedupe key already existed).
 */
export async function createNotification(input: NewNotification, database?: DB): Promise<boolean> {
  const db = database ?? (await getDb());
  const [row] = await db
    .insert(notifications)
    .values(toValues(input))
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  return !!row;
}

/** Insert many notifications in chunked multi-row INSERTs. Returns rows created. */
export async function createNotifications(
  inputs: NewNotification[],
  database?: DB,
): Promise<number> {
  if (inputs.length === 0) return 0;
  const db = database ?? (await getDb());
  let created = 0;
  for (let i = 0; i < inputs.length; i += FANOUT_CHUNK) {
    const chunk = inputs.slice(i, i + FANOUT_CHUNK).map(toValues);
    const rows = await db
      .insert(notifications)
      .values(chunk)
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    created += rows.length;
  }
  return created;
}

// ------------------------------------------------------------------
// Event creators — each one is called from the exact place where the
// core operation has already succeeded.
// ------------------------------------------------------------------

/**
 * FOLLOW: A followed B → one notification for B.
 * Self-follows never reach here (rejected by the follow API/library).
 * Repeated follows collapse on the dedupe key.
 */
export async function notifyFollow(actor: { id: string; username: string }, recipientUserId: string) {
  if (actor.id === recipientUserId) return false;
  return createNotification({
    recipientUserId,
    type: 'FOLLOW',
    actorUserId: actor.id,
    title: `@${actor.username} follows you`,
    message: '',
    link: `/u/${actor.username}`,
    dedupeKey: `FOLLOW:${actor.id}:${recipientUserId}`,
  });
}

/**
 * LIKE: A liked B's paste → one notification for B (the paste owner).
 * No notification for self-likes, guest likes (no actor) or ownerless
 * pastes. Repeated likes of the same paste collapse on the dedupe key.
 */
export async function notifyLike(
  actor: { id: string; username: string },
  paste: { id: string; userId: string | null; title: string },
) {
  const ownerId = paste.userId;
  if (!ownerId || ownerId === actor.id) return false;
  return createNotification({
    recipientUserId: ownerId,
    type: 'LIKE',
    actorUserId: actor.id,
    pasteId: paste.id,
    title: `@${actor.username} liked your post`,
    message: paste.title,
    link: `/p/${paste.id}`,
    dedupeKey: `LIKE:${actor.id}:${paste.id}`,
  });
}

/**
 * NEW_POST: fan a newly created PUBLIC paste out to every follower of
 * the author. The author is never a recipient (they cannot follow
 * themselves). Fanout is two queries + chunked inserts — one indexed
 * follower lookup (follows_following_idx) and multi-row INSERTs, never
 * a query per follower.
 *
 * Callers must only invoke this for pastes that are public AND not
 * password protected; `notifiableNewPaste` encodes that rule.
 */
export async function notifyNewPaste(
  author: { id: string; username: string },
  paste: { id: string; title: string },
): Promise<number> {
  const db = await getDb();
  const followers = await db
    .select({ id: follows.followerId })
    .from(follows)
    .where(eq(follows.followingId, author.id));
  if (followers.length === 0) return 0;

  const title = `@${author.username} made a new post`;
  return createNotifications(
    followers
      .filter((f) => f.id !== author.id)
      .map((f) => ({
        recipientUserId: f.id,
        type: 'NEW_POST' as const,
        actorUserId: author.id,
        pasteId: paste.id,
        title,
        message: paste.title,
        link: `/p/${paste.id}`,
        dedupeKey: `NEW_POST:${paste.id}:${f.id}`,
      })),
    db,
  );
}

/**
 * A new paste triggers follower notifications only when it is public and
 * unprotected. Unlisted and password-protected pastes notify nobody.
 */
export function notifiableNewPaste(paste: {
  visibility: string;
  passwordHash?: string | null;
}): boolean {
  return paste.visibility === 'public' && !paste.passwordHash;
}

/**
 * ADMIN broadcast: one notification for every registered user.
 * Authorization is the caller's responsibility (the API route gates it
 * behind the existing isAdmin() check). One broadcast operation gets one
 * broadcast id, so its recipient set is predictable and a retry with the
 * same id cannot double-notify anyone.
 */
export async function broadcastToAllUsers(input: {
  title: string;
  message: string;
  link?: string | null;
  broadcastId?: string;
}): Promise<{ broadcastId: string; recipients: number }> {
  const db = await getDb();
  const broadcastId = input.broadcastId ?? randomUUID();
  const recipients = await db.select({ id: users.id }).from(users);
  const created = await createNotifications(
    recipients.map((r) => ({
      recipientUserId: r.id,
      type: 'ADMIN' as const,
      actorUserId: null,
      pasteId: null,
      title: input.title,
      message: input.message,
      link: input.link ?? null,
      dedupeKey: `ADMIN:${broadcastId}:${r.id}`,
    })),
    db,
  );
  return { broadcastId, recipients: created };
}

/**
 * Notification writes must never break the operation that triggered
 * them: the follow/like/paste already succeeded and the user's response
 * must reflect that. Failures are swallowed (and logged) here.
 */
export async function notifySafely(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (err) {
    console.error('[notifications] delivery failed', err);
  }
}

// ------------------------------------------------------------------
// Reads — always scoped to one recipient. There is no code path that
// returns another user's notifications: `recipientUserId` comes from the
// session, never from a parameter the client controls.
// ------------------------------------------------------------------

/**
 * Keyset cursor: `<createdAtMs>_<id>`. Stable under inserts (unlike
 * OFFSET) and cheap on notifications_recipient_created_idx.
 */
export function encodeCursor(row: { createdAt: number; id: string }): string {
  return `${row.createdAt}_${row.id}`;
}

export function decodeCursor(cursor: string | null | undefined): { createdAt: number; id: string } | null {
  if (!cursor) return null;
  const at = cursor.indexOf('_');
  if (at <= 0) return null;
  const createdAt = Number(cursor.slice(0, at));
  const id = cursor.slice(at + 1);
  if (!Number.isFinite(createdAt) || !id) return null;
  return { createdAt, id };
}

export function clampLimit(raw: unknown, fallback = DEFAULT_PAGE_SIZE): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), MAX_PAGE_SIZE);
}

/**
 * Newest-first page of the signed-in user's notifications.
 * `limit` is always clamped, so an unbounded read is impossible.
 */
export async function listNotifications(
  recipientUserId: string,
  opts: { limit?: number; cursor?: string | null; unreadOnly?: boolean } = {},
): Promise<NotificationPage> {
  const db = await getDb();
  const limit = clampLimit(opts.limit, DEFAULT_PAGE_SIZE);
  const cursor = decodeCursor(opts.cursor);

  const conditions = [eq(notifications.recipientUserId, recipientUserId)];
  if (opts.unreadOnly) conditions.push(eq(notifications.isRead, false));
  if (cursor) {
    const cursorDate = new Date(cursor.createdAt);
    conditions.push(
      or(
        lt(notifications.createdAt, cursorDate),
        and(eq(notifications.createdAt, cursorDate), lt(notifications.id, cursor.id)),
      )!,
    );
  }

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      message: notifications.message,
      link: notifications.link,
      pasteId: notifications.pasteId,
      isRead: notifications.isRead,
      createdAt: notifications.createdAt,
      actorId: users.id,
      actorUsername: users.username,
      actorDisplayName: profiles.displayName,
      actorAvatarUrl: profiles.avatarUrl,
    })
    .from(notifications)
    .leftJoin(users, eq(notifications.actorUserId, users.id))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const mapped: NotificationRow[] = page.map((r) => ({
    id: r.id,
    type: r.type as NotificationType,
    title: r.title,
    message: r.message,
    link: r.link,
    pasteId: r.pasteId,
    isRead: !!r.isRead,
    createdAt: r.createdAt.getTime(),
    actor:
      r.actorId && r.actorUsername
        ? {
            id: r.actorId,
            username: r.actorUsername,
            displayName: r.actorDisplayName ?? null,
            avatarUrl: r.actorAvatarUrl ?? null,
          }
        : null,
  }));

  const last = mapped[mapped.length - 1];
  return {
    notifications: mapped,
    nextCursor: hasMore && last ? encodeCursor(last) : null,
    hasMore,
  };
}

/** Unread notification count for one user (indexed COUNT). */
export async function getUnreadCount(recipientUserId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(eq(notifications.recipientUserId, recipientUserId), eq(notifications.isRead, false)),
    );
  return Number(row?.n ?? 0);
}

/**
 * Mark ONE notification read. The recipient is part of the WHERE clause,
 * so another user's id can never be flipped — an unknown or foreign id
 * simply updates nothing and returns false (the route answers 404).
 */
export async function markNotificationRead(
  recipientUserId: string,
  notificationId: string,
): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.recipientUserId, recipientUserId),
      ),
    )
    .returning({ id: notifications.id });
  return rows.length > 0;
}

/** Mark every unread notification of the current user read. */
export async function markAllNotificationsRead(recipientUserId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(eq(notifications.recipientUserId, recipientUserId), eq(notifications.isRead, false)),
    )
    .returning({ id: notifications.id });
  return rows.length;
}
