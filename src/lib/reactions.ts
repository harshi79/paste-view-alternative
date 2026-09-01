import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb, type DB } from './db';
import { likes, pastes, reactions, stickers } from './db/schema';
import { isStickerToken } from './statusEmoji';

// ------------------------------------------------------------------
// UNIFIED post reactions — ONE reaction (or none) per signed-in user
// per post. The former Like ❤️ is simply one value of this system, not
// a separate concept:
//
//   ❤️  == the old "Like"
//   🔥😂😮😢💀👀  == the standard alternatives
//   :wave:        == any sticker from the EXISTING admin-curated pack
//
// - The `reactions` table's composite primary key (user_id, paste_id)
//   is the single source of truth and the duplicate guard: a user can
//   never hold two reactions on one post at the DATABASE level.
//   Selecting a different reaction REPLACES the single row atomically
//   (INSERT … ON CONFLICT DO UPDATE inside one transaction).
// - The legacy `likes` table only retains pre-unification ANONYMOUS
//   likes (ip_hash rows, no user). They are folded into the ❤️ count
//   by getReactionCounts so no existing like is ever lost; they are
//   never written again and are nobody's reaction state.
// - `pastes.likes_count` stays the denormalized ❤️ counter (❤️
//   reactions + anonymous likes) so dashboard/profile counts keep
//   working; every mutation recomputes it from the source rows, which
//   also makes it self-healing (no drift, no double counting).
// - Guests can never react: there is no anonymous actor here (the same
//   deliberate difference the bookmark system makes). Every function is
//   scoped to a user id the API layer took from the session.
// - Only canonical values are stored: ONE Unicode emoji grapheme
//   ('🔥') or the sticker pack's canonical token (':wave:'), validated
//   against the existing `stickers` table. The sticker system is
//   reused as-is — never duplicated.
// - Every query goes through Drizzle's parameter binding (no string
//   interpolation of user input into SQL).
// ------------------------------------------------------------------

/** The former Like, now one canonical reaction value. */
export const HEART_REACTION = '❤️';

/** Hard cap on the raw input length accepted for a reaction value. */
export const REACTION_MAX_LENGTH = 34;

export type ReactionCount = { reaction: string; count: number };

export type ReactionState = {
  /** Per-reaction totals for the post, most used first. */
  counts: ReactionCount[];
  /** Sum of all reactions (+ retained anonymous likes) on the post. */
  total: number;
  /** The current user's ONE reaction, or null when they have none. */
  mine: string | null;
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
 *   - a single Unicode emoji grapheme, NFC-normalized ('🔥', '👍🏽', '🇯🇵', '❤️'),
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

/**
 * Retained anonymous (ip_hash) likes on a paste — the pre-unification
 * guest hearts that cannot become user reactions but must keep counting
 * toward ❤️ so no existing like is silently lost.
 */
async function countAnonymousLikes(pasteId: string, database?: DB): Promise<number> {
  const db = database ?? (await getDb());
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(likes)
    .where(and(eq(likes.pasteId, pasteId), isNull(likes.userId)));
  return Number(row?.n ?? 0);
}

/**
 * Grouped counts for a post, most used first (ties broken
 * alphabetically). The ❤️ entry is the unified like count: ❤️ reactions
 * plus retained anonymous likes. There is exactly one entry per distinct
 * reaction — never duplicates, never a separate "like" total.
 */
export async function getReactionCounts(pasteId: string, database?: DB): Promise<ReactionCount[]> {
  const db = database ?? (await getDb());
  const rows = await db
    .select({ reaction: reactions.reaction, count: sql<number>`count(*)` })
    .from(reactions)
    .where(eq(reactions.pasteId, pasteId))
    .groupBy(reactions.reaction)
    .orderBy(desc(sql`count(*)`), asc(reactions.reaction));

  const merged = new Map<string, number>(
    rows.map((r) => [r.reaction, Number(r.count ?? 0)]),
  );
  const anonymous = await countAnonymousLikes(pasteId, db);
  if (anonymous > 0) {
    merged.set(HEART_REACTION, (merged.get(HEART_REACTION) ?? 0) + anonymous);
  }

  // Re-sort after the fold: merging the retained anonymous likes into ❤️
  // can change the ranking (most used first, ties broken alphabetically).
  return [...merged.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reaction, count]) => ({ reaction, count }));
}

/** The user's ONE current reaction on a post, or null when they have none. */
export async function getUserReaction(
  userId: string,
  pasteId: string,
  database?: DB,
): Promise<string | null> {
  const db = database ?? (await getDb());
  const [row] = await db
    .select({ reaction: reactions.reaction })
    .from(reactions)
    .where(and(eq(reactions.pasteId, pasteId), eq(reactions.userId, userId)))
    .limit(1);
  return row?.reaction ?? null;
}

/**
 * Counts for a post plus the caller's own reaction. `userId` is null for
 * guests, whose `mine` is always null — the public counts stay readable.
 */
export async function getReactionState(
  pasteId: string,
  userId: string | null,
  database?: DB,
): Promise<ReactionState> {
  const db = database ?? (await getDb());
  const [counts, mine] = await Promise.all([
    getReactionCounts(pasteId, db),
    userId ? getUserReaction(userId, pasteId, db) : Promise.resolve<string | null>(null),
  ]);
  return {
    counts,
    total: counts.reduce((sum, c) => sum + c.count, 0),
    mine,
  };
}

/** Whether the user's current reaction on the post is exactly this value. */
export async function hasReaction(
  userId: string,
  pasteId: string,
  reaction: string,
  database?: DB,
): Promise<boolean> {
  return (await getUserReaction(userId, pasteId, database)) === reaction;
}

/**
 * Recompute the paste's denormalized ❤️ counter from the source rows
 * (❤️ reactions + retained anonymous likes). Deriving the value from the
 * rows — instead of applying a +/- delta — makes it self-healing: a
 * raced retry can increment nothing twice, so counts can never drift or
 * double-count.
 *
 * Accepts the transaction OR the database (both can execute raw SQL).
 */
type SqlExecutor = Pick<DB, 'run'>;
async function syncLikesCount(db: SqlExecutor, pasteId: string): Promise<void> {
  await db.run(sql`
    UPDATE pastes SET likes_count = (
      (SELECT COUNT(*) FROM reactions
        WHERE reactions.paste_id = ${pasteId} AND reactions.reaction = ${HEART_REACTION})
      + (SELECT COUNT(*) FROM likes
        WHERE likes.paste_id = ${pasteId} AND likes.user_id IS NULL)
    ) WHERE pastes.id = ${pasteId}
  `);
}

export type SetReactionResult = {
  ok: true;
  /** Always true — after setReaction the user HAS a reaction. */
  active: true;
  /** True when a new row was inserted (no previous reaction existed). */
  created: boolean;
  /** The user's previous reaction, or null when they had none. */
  previous: string | null;
  /** True when an existing (different) reaction was replaced. */
  replaced: boolean;
};

/**
 * Select the user's ONE reaction on a post, replacing any previous
 * reaction atomically. The database primary key makes a second row for
 * the same (user, paste) impossible: an existing row is UPDATEd in
 * place by the upsert, never duplicated.
 *
 * Re-selecting the value the user already has is an idempotent no-op
 * (`created: false`, `replaced: false`, nothing written).
 *
 * `reaction` must already be canonical (see `resolveReaction`).
 */
export async function setReaction(
  userId: string,
  pasteId: string,
  reaction: string,
): Promise<SetReactionResult> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ reaction: reactions.reaction })
      .from(reactions)
      .where(and(eq(reactions.userId, userId), eq(reactions.pasteId, pasteId)))
      .limit(1);
    if (existing?.reaction === reaction) {
      return { ok: true, active: true, created: false, previous: reaction, replaced: false };
    }
    await tx
      .insert(reactions)
      .values({ userId, pasteId, reaction, createdAt: new Date() })
      .onConflictDoUpdate({
        target: [reactions.userId, reactions.pasteId],
        set: { reaction, createdAt: new Date() },
      });
    await syncLikesCount(tx, pasteId);
    return {
      ok: true,
      active: true,
      created: !existing,
      previous: existing?.reaction ?? null,
      replaced: !!existing,
    };
  });
}

export type RemoveReactionResult = {
  ok: true;
  /** Always false — after removeReaction the user has NO reaction. */
  active: false;
  /** True when a reaction row was actually deleted. */
  removed: boolean;
  /** The reaction that was removed, or null when there was none. */
  previous: string | null;
};

/**
 * Remove the user's current reaction (whatever it is), permanently.
 * Idempotent: removing when there is no reaction is a no-op
 * (`removed: false`). The WHERE clause is keyed on the caller's own
 * user id, so one user can never delete another user's reaction.
 */
export async function removeReaction(
  userId: string,
  pasteId: string,
): Promise<RemoveReactionResult> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(reactions)
      .where(and(eq(reactions.userId, userId), eq(reactions.pasteId, pasteId)))
      .returning({ reaction: reactions.reaction });
    if (removed.length > 0) {
      await syncLikesCount(tx, pasteId);
    }
    return {
      ok: true,
      active: false,
      removed: removed.length > 0,
      previous: removed[0]?.reaction ?? null,
    };
  });
}

export type ToggleReactionResult =
  | { ok: true; active: true; created: boolean; removed: false; previous: string | null }
  | { ok: true; active: false; created: false; removed: boolean; previous: string | null };

/**
 * Toggle one reaction: select it (replacing any other reaction), or —
 * when it is ALREADY the user's current reaction — remove it. A user
 * can never end up holding two reactions through this path.
 */
export async function toggleReaction(
  userId: string,
  pasteId: string,
  reaction: string,
): Promise<ToggleReactionResult> {
  const current = await getUserReaction(userId, pasteId);
  if (current === reaction) {
    const result = await removeReaction(userId, pasteId);
    return {
      ok: true,
      active: false,
      created: false,
      removed: result.removed,
      previous: result.previous,
    };
  }
  const result = await setReaction(userId, pasteId, reaction);
  return {
    ok: true,
    active: true,
    created: result.created,
    removed: false,
    previous: result.previous,
  };
}
