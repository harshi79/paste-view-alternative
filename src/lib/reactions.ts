import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb, type DB } from './db';
import { reactions, stickers } from './db/schema';
import { isStickerToken } from './statusEmoji';

// ------------------------------------------------------------------
// Post reactions — signed-in users reacting to a post with an emoji or
// a sticker from the EXISTING admin-curated sticker pack.
//
// - One row per (user, paste, reaction). The composite primary key makes
//   duplicates impossible at the DB level, and inserts use ON CONFLICT DO
//   NOTHING so a repeated reaction is a safe no-op (same idempotency
//   pattern as src/lib/likes.ts, src/lib/follows.ts and
//   src/lib/bookmarks.ts). One user can hold MULTIPLE DIFFERENT reactions
//   on the same post — one row each.
// - Guests can never react: there is no anonymous/IP actor here (the same
//   deliberate difference from likes that bookmarks make). Every function
//   below is scoped to a user id the API layer took from the session, so
//   there is no code path that reads or writes another user's reactions.
// - Only canonical values are stored: either ONE Unicode emoji grapheme
//   ('🔥') or the sticker pack's existing canonical token (':wave:').
//   Rendered HTML, markup, URLs and unknown tokens are rejected before
//   any write — the sticker system is reused, never duplicated: a token
//   is only accepted when it exists in the `stickers` table, and display
//   still resolves it through the existing sticker renderers.
// - Every query goes through Drizzle's parameter binding (no string
//   interpolation of user input into SQL).
// ------------------------------------------------------------------

/** Hard cap on the raw input length accepted for a reaction value. */
export const REACTION_MAX_LENGTH = 34;

/**
 * Cap on how many DIFFERENT reactions one user may hold on one post.
 * Duplicate prevention is the DB's job; this only bounds fan-out abuse.
 */
export const MAX_REACTIONS_PER_USER_PER_PASTE = 20;

export type ReactionCount = { reaction: string; count: number };

export type ReactionState = {
  /** Per-reaction totals for the post, most used first. */
  counts: ReactionCount[];
  /** Sum of all reaction rows on the post. */
  total: number;
  /** The current user's own reactions (empty for guests). */
  mine: string[];
};

/** True when the value is the sticker pack's canonical token form. */
export function isReactionStickerToken(value: string): boolean {
  return isStickerToken(value);
}

/**
 * Shape-level validation, no database access.
 *
 * Returns the canonical form of an accepted reaction:
 *   - a sticker token, lower-cased (':WAVE:' → ':wave:'); existence in the
 *     pack is verified separately by `resolveReaction`,
 *   - a single Unicode emoji grapheme, NFC-normalized ('🔥', '👍🏽', '🇯🇵'),
 * or null when the input is anything else (plain text, HTML, a URL, an
 * over-long string, control characters, several emoji, …).
 */
export function normalizeReactionInput(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().normalize('NFC');
  if (!value || value.length > REACTION_MAX_LENGTH) return null;
  // Never accept control characters or anything HTML/markup shaped.
  if (/[\u0000-\u001f\u007f<>&"']/u.test(value)) return null;
  if (/^(?:https?:|data:|javascript:|file:)/i.test(value)) return null;

  const lowered = value.toLowerCase();
  if (isStickerToken(lowered)) return lowered;

  // Exactly one emoji grapheme (ZWJ sequences, flags, keycaps and skin
  // tone modifiers all count as one) — same grapheme-aware approach the
  // profile status validator uses.
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const graphemes = Array.from(segmenter.segment(value), (entry) => entry.segment);
  if (graphemes.length !== 1) return null;
  const emojiPart = /\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u;
  return emojiPart.test(graphemes[0]) ? value : null;
}

/**
 * Full server-side validation. Emoji are accepted on shape alone; a
 * sticker token is only accepted when that token really exists in the
 * admin-curated `stickers` table, and the value stored is the pack's own
 * canonical token (never a rendered image, URL or HTML).
 */
export async function resolveReaction(raw: unknown, database?: DB): Promise<string | null> {
  const normalized = normalizeReactionInput(raw);
  if (!normalized) return null;
  if (!isStickerToken(normalized)) return normalized; // Unicode emoji

  const db = database ?? (await getDb());
  const [row] = await db
    .select({ token: stickers.token })
    .from(stickers)
    .where(sql`lower(${stickers.token}) = ${normalized}`)
    .limit(1);
  return row?.token ?? null;
}

/** Grouped counts for a post, most used first (ties broken alphabetically). */
export async function getReactionCounts(pasteId: string, database?: DB): Promise<ReactionCount[]> {
  const db = database ?? (await getDb());
  const rows = await db
    .select({ reaction: reactions.reaction, count: sql<number>`count(*)` })
    .from(reactions)
    .where(eq(reactions.pasteId, pasteId))
    .groupBy(reactions.reaction)
    .orderBy(desc(sql`count(*)`), asc(reactions.reaction));
  return rows.map((r) => ({ reaction: r.reaction, count: Number(r.count ?? 0) }));
}

/** One user's own reactions on a post (oldest first). */
export async function getUserReactions(
  userId: string,
  pasteId: string,
  database?: DB,
): Promise<string[]> {
  const db = database ?? (await getDb());
  const rows = await db
    .select({ reaction: reactions.reaction })
    .from(reactions)
    .where(and(eq(reactions.pasteId, pasteId), eq(reactions.userId, userId)))
    .orderBy(asc(reactions.createdAt), asc(reactions.reaction));
  return rows.map((r) => r.reaction);
}

/**
 * Counts for a post plus the caller's own reactions. `userId` is null for
 * guests, whose `mine` is always empty — the public counts stay readable.
 */
export async function getReactionState(
  pasteId: string,
  userId: string | null,
  database?: DB,
): Promise<ReactionState> {
  const db = database ?? (await getDb());
  const [counts, mine] = await Promise.all([
    getReactionCounts(pasteId, db),
    userId ? getUserReactions(userId, pasteId, db) : Promise.resolve<string[]>([]),
  ]);
  return {
    counts,
    total: counts.reduce((sum, c) => sum + c.count, 0),
    mine,
  };
}

/** Whether the user already holds this exact reaction on this post. */
export async function hasReaction(
  userId: string,
  pasteId: string,
  reaction: string,
  database?: DB,
): Promise<boolean> {
  const db = database ?? (await getDb());
  const [row] = await db
    .select({ reaction: reactions.reaction })
    .from(reactions)
    .where(
      and(
        eq(reactions.userId, userId),
        eq(reactions.pasteId, pasteId),
        eq(reactions.reaction, reaction),
      ),
    )
    .limit(1);
  return !!row;
}

export type AddReactionResult =
  | { ok: true; active: true; created: boolean }
  | { ok: false; reason: 'limit' };

/**
 * Add one reaction. Idempotent: reacting again with the SAME value is a
 * no-op collapsed by the composite primary key + ON CONFLICT DO NOTHING
 * (`created: false`), so a double-tap or raced retry can never create
 * duplicates. Different values from the same user coexist as separate
 * rows. Fails with `reason: 'limit'` past
 * MAX_REACTIONS_PER_USER_PER_PASTE distinct reactions.
 *
 * `reaction` must already be canonical (see `resolveReaction`).
 */
export async function addReaction(
  userId: string,
  pasteId: string,
  reaction: string,
): Promise<AddReactionResult> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ reaction: reactions.reaction })
      .from(reactions)
      .where(and(eq(reactions.userId, userId), eq(reactions.pasteId, pasteId)));
    if (existing.some((r) => r.reaction === reaction)) {
      return { ok: true, active: true, created: false } as const;
    }
    if (existing.length >= MAX_REACTIONS_PER_USER_PER_PASTE) {
      return { ok: false, reason: 'limit' } as const;
    }
    const [row] = await tx
      .insert(reactions)
      .values({ userId, pasteId, reaction, createdAt: new Date() })
      .onConflictDoNothing()
      .returning({ reaction: reactions.reaction });
    return { ok: true, active: true, created: !!row } as const;
  });
}

/**
 * Remove one reaction permanently. Idempotent: removing a reaction that
 * is not there is a no-op (`removed: false`). The WHERE clause is keyed
 * on the caller's own user id, so one user can never delete another
 * user's reaction.
 */
export async function removeReaction(
  userId: string,
  pasteId: string,
  reaction: string,
): Promise<{ active: false; removed: boolean }> {
  const db = await getDb();
  const removed = await db
    .delete(reactions)
    .where(
      and(
        eq(reactions.userId, userId),
        eq(reactions.pasteId, pasteId),
        eq(reactions.reaction, reaction),
      ),
    )
    .returning({ reaction: reactions.reaction });
  return { active: false, removed: removed.length > 0 };
}

export type ToggleReactionResult =
  | { ok: true; active: boolean; created: boolean; removed: boolean }
  | { ok: false; reason: 'limit' };

/** Add the reaction when absent, remove it when present. */
export async function toggleReaction(
  userId: string,
  pasteId: string,
  reaction: string,
): Promise<ToggleReactionResult> {
  if (await hasReaction(userId, pasteId, reaction)) {
    const { removed } = await removeReaction(userId, pasteId, reaction);
    return { ok: true, active: false, created: false, removed };
  }
  const added = await addReaction(userId, pasteId, reaction);
  if (!added.ok) return added;
  return { ok: true, active: true, created: added.created, removed: false };
}
