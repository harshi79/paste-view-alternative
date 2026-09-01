import { eq, sql } from 'drizzle-orm';
import { appMeta } from './schema';
import type { DB } from './index';

// ------------------------------------------------------------------
// One-time migration: unify reactions (and the legacy Like system).
//
// Previous (incorrect) model:
//   reactions: PRIMARY KEY (user_id, paste_id, reaction) — one row per
//   DIFFERENT reaction, so a user could hold several reactions on one
//   post. Likes were a completely separate table + counter.
//
// Unified model:
//   reactions: PRIMARY KEY (user_id, paste_id) — exactly ONE reaction
//   (or none) per user per post, enforced by the database. The ❤️ Like
//   is just one value of `reaction`; `pastes.likes_count` counts ❤️
//   reactions plus the retained anonymous (ip_hash) likes.
//
// Steps (all inside one transaction, so a crash leaves the old data
// untouched):
//   1. If the reactions table still has the old three-column primary
//      key, rebuild it with the unified key, keeping ONE row per
//      (user_id, paste_id) — the most recent reaction wins (tie broken
//      deterministically by the greater reaction value).
//   2. Convert every signed-in like into a ❤️ reaction. When the user
//      already has a reaction, the NEWER of the two wins (the like
//      wins only when it is strictly newer), so nobody ends up with
//      two reactions and no choice is silently overridden.
//   3. Delete the converted signed-in like rows — their state now
//      lives (exactly once) in reactions. Anonymous (ip_hash) likes
//      have no user to own a reaction: they are RETAINED so existing
//      like counts never drop, and they keep counting toward ❤️.
//   4. Recompute pastes.likes_count as ❤️ reactions + anonymous likes
//      (repairs any historic drift and guarantees no double counting).
//   5. Record the marker in app_meta; the whole migration is a no-op
//      on every later boot (the repo's existing marker convention —
//      see src/lib/db/seed.ts).
// ------------------------------------------------------------------

export const REACTIONS_UNIFIED_MARKER = 'migration:reactions-unified';

/** The former Like, stored as one canonical reaction value. */
export const HEART_REACTION = '❤️';

type TableInfoRow = { name: string; pk: number };

/** Accepts the database OR a transaction (both can execute raw SQL). */
type SqlExecutor = Pick<DB, 'run' | 'all'>;

/** The primary-key columns of a table, in key order (empty when absent). */
async function primaryKeyColumns(db: SqlExecutor, table: string): Promise<string[]> {
  const rows = await db.all<TableInfoRow>(sql.raw(`PRAGMA table_info(${table})`));
  return rows
    .filter((r) => Number(r.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk))
    .map((r) => r.name);
}

/** Recompute one paste's denormalized ❤️ counter from the source rows. */
export async function syncPasteLikesCount(db: Pick<DB, 'run'>, pasteId: string): Promise<void> {
  await db.run(sql`
    UPDATE pastes SET likes_count = (
      (SELECT COUNT(*) FROM reactions
        WHERE reactions.paste_id = ${pasteId} AND reactions.reaction = ${HEART_REACTION})
      + (SELECT COUNT(*) FROM likes
        WHERE likes.paste_id = ${pasteId} AND likes.user_id IS NULL)
    ) WHERE pastes.id = ${pasteId}
  `);
}

export async function migrateReactionsUnified(db: DB): Promise<void> {
  const [marker] = await db
    .select({ key: appMeta.key })
    .from(appMeta)
    .where(eq(appMeta.key, REACTIONS_UNIFIED_MARKER))
    .limit(1);
  if (marker) return; // already applied — idempotent no-op

  await db.transaction(async (tx) => {
    // (1) Rebuild the reactions table when it still carries the old
    //     (user_id, paste_id, reaction) primary key. Fresh databases
    //     are created with the unified key already and skip this.
    const pk = await primaryKeyColumns(tx, 'reactions');
    if (pk.length === 3) {
      await tx.run(sql.raw('DROP TABLE IF EXISTS reactions_unified'));
      await tx.run(sql.raw(`
        CREATE TABLE reactions_unified (
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          paste_id TEXT NOT NULL REFERENCES pastes(id) ON DELETE CASCADE,
          reaction TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, paste_id)
        )
      `));
      // Keep exactly one row per (user_id, paste_id): the user's most
      // recent reaction. ROW_NUMBER makes the choice deterministic, so
      // re-running could never pick a different survivor.
      await tx.run(sql.raw(`
        INSERT INTO reactions_unified (user_id, paste_id, reaction, created_at)
        SELECT user_id, paste_id, reaction, created_at FROM (
          SELECT user_id, paste_id, reaction, created_at,
                 ROW_NUMBER() OVER (
                   PARTITION BY user_id, paste_id
                   ORDER BY created_at DESC, reaction DESC
                 ) AS rn
          FROM reactions
        ) ranked
        WHERE rn = 1
      `));
      await tx.run(sql.raw('DROP TABLE reactions'));
      await tx.run(sql.raw('ALTER TABLE reactions_unified RENAME TO reactions'));
      await tx.run(
        sql.raw('CREATE INDEX IF NOT EXISTS reactions_paste_reaction_idx ON reactions (paste_id, reaction)'),
      );
      await tx.run(
        sql.raw('CREATE INDEX IF NOT EXISTS reactions_paste_user_idx ON reactions (paste_id, user_id)'),
      );
    }

    // (2) Signed-in likes become ❤️ reactions. On conflict (the user
    //     already has a reaction) the strictly NEWER event wins; a tie
    //     keeps the existing reaction.
    await tx.run(sql`
      INSERT INTO reactions (user_id, paste_id, reaction, created_at)
      SELECT user_id, paste_id, ${HEART_REACTION}, created_at
      FROM likes
      WHERE user_id IS NOT NULL
      ON CONFLICT (user_id, paste_id) DO UPDATE SET
        reaction = excluded.reaction,
        created_at = excluded.created_at
      WHERE excluded.created_at > reactions.created_at
    `);

    // (3) The converted like rows must not live twice. Anonymous rows
    //     (ip_hash only) are kept — see header comment.
    await tx.run(sql`DELETE FROM likes WHERE user_id IS NOT NULL`);

    // (4) likes_count := ❤️ reactions + anonymous likes, only where it
    //     differs (avoids rewriting every paste row).
    await tx.run(sql`
      UPDATE pastes SET likes_count = (
        (SELECT COUNT(*) FROM reactions
          WHERE reactions.paste_id = pastes.id AND reactions.reaction = ${HEART_REACTION})
        + (SELECT COUNT(*) FROM likes
          WHERE likes.paste_id = pastes.id AND likes.user_id IS NULL)
      )
      WHERE likes_count <> (
        (SELECT COUNT(*) FROM reactions
          WHERE reactions.paste_id = pastes.id AND reactions.reaction = ${HEART_REACTION})
        + (SELECT COUNT(*) FROM likes
          WHERE likes.paste_id = pastes.id AND likes.user_id IS NULL)
      )
    `);

    // (5) Mark as done — later boots skip everything above.
    await tx
      .insert(appMeta)
      .values({ key: REACTIONS_UNIFIED_MARKER, value: '1' })
      .onConflictDoUpdate({ target: appMeta.key, set: { value: '1' } });
  });
}
