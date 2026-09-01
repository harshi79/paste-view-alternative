/**
 * Likes → ❤️ unification migration tests.
 *
 * Simulates a REAL pre-unification database (the incorrect TODO 1 era):
 *   - `reactions` with the old three-column primary key
 *     (user_id, paste_id, reaction) holding MULTIPLE reactions per user
 *   - `likes` with signed-in like rows (user_id) AND anonymous ip_hash
 *     rows, plus a deliberately wrong denormalized likes_count
 *
 * …then boots the app's own getDb() against that file and verifies the
 * one-time marker-guarded migration (src/lib/db/migrateReactions.ts):
 *   - the reactions table is rebuilt with PRIMARY KEY (user_id, paste_id)
 *   - each user keeps exactly ONE reaction (their most recent)
 *   - signed-in likes become ❤️ (conflict: the newer event wins)
 *   - converted like rows are gone (no double record), anonymous likes
 *     are RETAINED and keep counting toward ❤️ (nothing silently lost)
 *   - likes_count is recomputed as ❤️ reactions + anonymous likes
 *   - the DB now refuses a second reaction row for the same user+paste
 *   - the migration is idempotent (re-running changes nothing)
 *   - the full end-to-end flow works on the migrated database:
 *     ❤️ → 🔥 → :wave: → none, with exactly one row at every step.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { createClient } from '@libsql/client';

const tmpDir = mkdtempSync(join(tmpdir(), 'vibebin-reactions-migration-test-'));
process.chdir(tmpDir);
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.VERCEL;
process.env.AUTH_SECRET = 'unit-test-secret-0123456789-abcdef0123456789';

// --- In-memory cookie store standing in for the Next request scope --------
const { cookieJar } = vi.hoisted(() => ({ cookieJar: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
  headers: async () => new Headers(),
}));

// ------------------------------------------------------------------
// Build the OLD database (before any app module is imported) — the
// schema and data exactly as the incorrect TODO 1 era left them.
// ------------------------------------------------------------------
const T = { old: 1000, mid: 2000, new: 3000 };
const ALICE = 'mig-alice';
const BOB = 'mig-bob';
const CAROL = 'mig-carol';

const seedClient = createClient({ url: 'file:local.db' });
for (const stmt of [
  `CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    username_changed_at INTEGER
  )`,
  `CREATE TABLE profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT,
    bio TEXT NOT NULL DEFAULT '',
    bio_enabled INTEGER NOT NULL DEFAULT 1,
    avatar_url TEXT,
    banner_url TEXT,
    banner_type TEXT NOT NULL DEFAULT 'image',
    name_from TEXT NOT NULL DEFAULT '#a78bfa',
    name_to TEXT NOT NULL DEFAULT '#22d3ee',
    name_style TEXT NOT NULL DEFAULT 'gradient',
    name_effect TEXT NOT NULL DEFAULT 'none',
    effect_speed INTEGER NOT NULL DEFAULT 50,
    effect_intensity INTEGER NOT NULL DEFAULT 60,
    accent TEXT NOT NULL DEFAULT '#8b5cf6',
    links TEXT NOT NULL DEFAULT '[]',
    views INTEGER NOT NULL DEFAULT 0,
    status_emoji TEXT NOT NULL DEFAULT '',
    status_text TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE pastes (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Untitled',
    title_color TEXT,
    format TEXT NOT NULL DEFAULT 'plain',
    content TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'plaintext',
    visibility TEXT NOT NULL DEFAULT 'public',
    password_hash TEXT,
    expires_at INTEGER,
    pinned INTEGER NOT NULL DEFAULT 0,
    views INTEGER NOT NULL DEFAULT 0,
    likes_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE likes (
    id TEXT PRIMARY KEY,
    paste_id TEXT NOT NULL REFERENCES pastes(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    ip_hash TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX likes_paste_idx ON likes (paste_id)`,
  `CREATE INDEX likes_user_idx ON likes (user_id)`,
  `CREATE UNIQUE INDEX likes_paste_user_idx ON likes (paste_id, user_id) WHERE user_id IS NOT NULL`,
  `CREATE UNIQUE INDEX likes_paste_ip_idx ON likes (paste_id, ip_hash) WHERE ip_hash IS NOT NULL`,
  // The OLD (wrong) reactions table: one row per DIFFERENT reaction.
  `CREATE TABLE reactions (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    paste_id TEXT NOT NULL REFERENCES pastes(id) ON DELETE CASCADE,
    reaction TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, paste_id, reaction)
  )`,
  `CREATE INDEX reactions_paste_reaction_idx ON reactions (paste_id, reaction)`,
  `CREATE INDEX reactions_paste_user_idx ON reactions (paste_id, user_id)`,
  // Sticker pack (base table not created by MIGRATION_STATEMENTS).
  `CREATE TABLE stickers (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    url TEXT,
    emoji TEXT,
    label TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`,
  // Skip first-install seeding on this deliberately pre-populated DB.
  `CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT)`,
  `INSERT INTO app_meta (key, value) VALUES ('seed:initialized', '1')`,
]) {
  await seedClient.execute(stmt);
}

for (const [id, username] of [
  [ALICE, 'alice'],
  [BOB, 'bob'],
  [CAROL, 'carol'],
] as const) {
  await seedClient.execute({
    sql: 'INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)',
    args: [id, username, 'x', T.old],
  });
}

async function insertPaste(id: string, ownerId: string, likesCount: number) {
  await seedClient.execute({
    sql: `INSERT INTO pastes (id, user_id, title, format, content, language, visibility,
          likes_count, created_at) VALUES (?, ?, ?, 'plain', 'c', 'plaintext', 'public', ?, ?)`,
    args: [id, ownerId, `Paste ${id}`, likesCount, T.old],
  });
}

async function insertLike(pasteId: string, userId: string | null, ipHash: string | null, at: number) {
  await seedClient.execute({
    sql: 'INSERT INTO likes (id, paste_id, user_id, ip_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [randomUUID(), pasteId, userId, ipHash, at],
  });
}

async function insertReaction(pasteId: string, userId: string, reaction: string, at: number) {
  await seedClient.execute({
    sql: 'INSERT INTO reactions (user_id, paste_id, reaction, created_at) VALUES (?, ?, ?, ?)',
    args: [userId, pasteId, reaction, at],
  });
}

// P1 — the messy paste: alice held TWO reactions (the wrong old model)
// AND liked; bob liked; two anonymous visitors liked; counter drifted.
await insertPaste('p-multi', BOB, 99);
await insertReaction('p-multi', ALICE, '🔥', T.mid);
await insertReaction('p-multi', ALICE, '😂', T.new); // alice's latest choice
await insertLike('p-multi', ALICE, null, T.old);
await insertLike('p-multi', BOB, null, T.mid);
await insertLike('p-multi', null, 'anon-hash-1', T.old);
await insertLike('p-multi', null, 'anon-hash-2', T.mid);

// P2 — bob liked AFTER reacting 🔥: the like (newer) wins → ❤️.
await insertPaste('p-like-newer', CAROL, 5);
await insertLike('p-like-newer', BOB, null, T.new);
await insertReaction('p-like-newer', BOB, '🔥', T.mid);

// P3 — carol reacted 👀 AFTER liking: the reaction (newer) wins.
await insertPaste('p-reaction-newer', BOB, 7);
await insertLike('p-reaction-newer', CAROL, null, T.mid);
await insertReaction('p-reaction-newer', CAROL, '👀', T.new);

// P4 — a classic pre-reactions paste: one member like + one guest like.
await insertPaste('p-likes-only', ALICE, 2);
await insertLike('p-likes-only', BOB, null, T.mid);
await insertLike('p-likes-only', null, 'anon-hash-3', T.mid);

await seedClient.execute({
  sql: `INSERT INTO stickers (id, token, url, emoji, label, created_at)
        VALUES (?, ':wave:', 'https://example.com/wave.gif', '👋', 'Wave', ?)`,
  args: [randomUUID(), T.old],
});
seedClient.close();

// ------------------------------------------------------------------
// Boot the app database layer against that old file — this runs the
// real boot path (MIGRATION_STATEMENTS + migrateReactionsUnified).
// ------------------------------------------------------------------
const { getDb } = await import('@/lib/db');
const { migrateReactionsUnified } = await import('@/lib/db/migrateReactions');
const { getReactionCounts, getUserReaction } = await import('@/lib/reactions');
const { createSession } = await import('@/lib/auth');
const reactionsRoute = await import('@/app/api/pastes/[id]/reactions/route');
const reactionsPOST = reactionsRoute.POST;
const reactionsDELETE = reactionsRoute.DELETE;
const { pastes, reactions, users } = await import('@/lib/db/schema');

let db: Awaited<ReturnType<typeof getDb>>;

beforeAll(async () => {
  db = await getDb();
  await createSession({ id: ALICE, username: 'alice' });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function req(path: string, method = 'GET', body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

async function pasteRow(id: string) {
  const [row] = await db.select().from(pastes).where(eq(pastes.id, id)).limit(1);
  return row;
}

async function reactionRows(pasteId: string) {
  return db
    .select({ userId: reactions.userId, reaction: reactions.reaction })
    .from(reactions)
    .where(eq(reactions.pasteId, pasteId))
    .orderBy(reactions.userId);
}

async function likeRows() {
  return db.all<{ paste_id: string; user_id: string | null; ip_hash: string | null }>(
    sql`SELECT paste_id, user_id, ip_hash FROM likes ORDER BY paste_id, ip_hash`,
  );
}

// ------------------------------------------------------------------
// Structure
// ------------------------------------------------------------------
describe('migration — unified schema', () => {
  it('the reactions table now has PRIMARY KEY (user_id, paste_id)', async () => {
    const info = await db.all<{ name: string; pk: number }>(
      sql.raw('PRAGMA table_info(reactions)'),
    );
    const pk = info
      .filter((r) => Number(r.pk) > 0)
      .sort((a, b) => Number(a.pk) - Number(b.pk))
      .map((r) => r.name);
    expect(pk).toEqual(['user_id', 'paste_id']);
  });

  it('the database refuses a second reaction row for one user+paste', async () => {
    await expect(
      db.insert(reactions).values({
        userId: ALICE,
        pasteId: 'p-multi',
        reaction: '🔥',
        createdAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  it('records the one-time marker in app_meta', async () => {
    const rows = await db.all<{ value: string }>(
      sql.raw(`SELECT value FROM app_meta WHERE key = 'migration:reactions-unified'`),
    );
    expect(rows).toEqual([{ value: '1' }]);
  });
});

// ------------------------------------------------------------------
// Data conversion
// ------------------------------------------------------------------
describe('migration — data conversion', () => {
  it('keeps exactly ONE reaction per user: the most recent (❤️ never stacks)', async () => {
    expect(await getUserReaction(ALICE, 'p-multi')).toBe('😂'); // newest of 🔥/😂
    const rows = await reactionRows('p-multi');
    expect(rows).toEqual([
      { userId: ALICE, reaction: '😂' },
      { userId: BOB, reaction: '❤️' },
    ]);
  });

  it('resolves like-vs-reaction conflicts by recency', async () => {
    // Bob's newer LIKE replaced his 🔥 with ❤️.
    expect(await getUserReaction(BOB, 'p-like-newer')).toBe('❤️');
    // Carol's newer 👀 reaction survived her older like.
    expect(await getUserReaction(CAROL, 'p-reaction-newer')).toBe('👀');
    // A plain like became ❤️.
    expect(await getUserReaction(BOB, 'p-likes-only')).toBe('❤️');
  });

  it('removes converted member likes, retains anonymous likes', async () => {
    const rows = await likeRows();
    // No signed-in like rows remain anywhere (their state lives in reactions).
    expect(rows.filter((r) => r.user_id !== null)).toEqual([]);
    // All anonymous likes are preserved exactly.
    expect(rows.filter((r) => r.user_id === null).map((r) => r.ip_hash).sort()).toEqual(
      ['anon-hash-1', 'anon-hash-2', 'anon-hash-3'],
    );
  });

  it('recomputes likes_count as ❤️ reactions + anonymous likes (no drift, no double count)', async () => {
    expect((await pasteRow('p-multi')).likesCount).toBe(3); // bob ❤️ + 2 anon
    expect((await pasteRow('p-like-newer')).likesCount).toBe(1); // bob ❤️
    expect((await pasteRow('p-reaction-newer')).likesCount).toBe(0); // 👀 is not a like
    expect((await pasteRow('p-likes-only')).likesCount).toBe(2); // bob ❤️ + 1 anon
  });

  it('folds retained anonymous likes into the ❤️ count (existing likes not lost)', async () => {
    expect(await getReactionCounts('p-multi')).toEqual([
      { reaction: '❤️', count: 3 },
      { reaction: '😂', count: 1 },
    ]);
    expect(await getReactionCounts('p-likes-only')).toEqual([{ reaction: '❤️', count: 2 }]);
    expect(await getReactionCounts('p-reaction-newer')).toEqual([{ reaction: '👀', count: 1 }]);
  });
});

// ------------------------------------------------------------------
// Idempotency
// ------------------------------------------------------------------
describe('migration — idempotency', () => {
  it('re-running the migration changes nothing', async () => {
    const beforeReactions = JSON.stringify(await reactionRows('p-multi'));
    const beforeLikes = JSON.stringify(await likeRows());
    const beforeCounts = JSON.stringify([
      (await pasteRow('p-multi')).likesCount,
      (await pasteRow('p-likes-only')).likesCount,
    ]);

    await migrateReactionsUnified(db); // marker present → no-op

    expect(JSON.stringify(await reactionRows('p-multi'))).toBe(beforeReactions);
    expect(JSON.stringify(await likeRows())).toBe(beforeLikes);
    expect(JSON.stringify([
      (await pasteRow('p-multi')).likesCount,
      (await pasteRow('p-likes-only')).likesCount,
    ])).toBe(beforeCounts);
  });
});

// ------------------------------------------------------------------
// End-to-end on the migrated database
// ------------------------------------------------------------------
describe('migration — end-to-end unified flow', () => {
  it('❤️ → 🔥 → :wave: → none, one row at every step', async () => {
    expect(await getUserReaction(ALICE, 'p-multi')).toBe('😂');

    // 😂 → ❤️ (POST /like compatibility endpoint selects ❤️).
    const likeRoute = await import('@/app/api/pastes/[id]/like/route');
    const like = await likeRoute.POST(req('/api/pastes/p-multi/like'), {
      params: Promise.resolve({ id: 'p-multi' }),
    });
    expect(like.status).toBe(200);
    expect((await like.json()).count).toBe(4); // bob + alice ❤️ + 2 anon
    expect(await getUserReaction(ALICE, 'p-multi')).toBe('❤️');

    // ❤️ → 🔥
    const fire = await reactionsPOST(
      req('/api/pastes/p-multi/reactions', 'POST', { reaction: '🔥' }),
      { params: Promise.resolve({ id: 'p-multi' }) },
    );
    const fireBody = await fire.json();
    expect(fireBody.mine).toBe('🔥');
    expect(fireBody.previous).toBe('❤️');
    expect(fireBody.counts).toEqual([
      { reaction: '❤️', count: 3 }, // alice left ❤️ (bob + 2 anon remain)
      { reaction: '🔥', count: 1 },
    ]);
    expect((await reactionRows('p-multi')).filter((r) => r.userId === ALICE)).toEqual([
      { userId: ALICE, reaction: '🔥' },
    ]);
    expect((await pasteRow('p-multi')).likesCount).toBe(3);

    // 🔥 → :wave:
    const wave = await reactionsPOST(
      req('/api/pastes/p-multi/reactions', 'POST', { reaction: ':wave:' }),
      { params: Promise.resolve({ id: 'p-multi' }) },
    );
    expect((await wave.json()).counts).toEqual([
      { reaction: '❤️', count: 3 },
      { reaction: ':wave:', count: 1 },
    ]);
    expect((await reactionRows('p-multi')).filter((r) => r.userId === ALICE)).toEqual([
      { userId: ALICE, reaction: ':wave:' },
    ]);

    // :wave: → none
    const off = await reactionsDELETE(req('/api/pastes/p-multi/reactions', 'DELETE'), {
      params: Promise.resolve({ id: 'p-multi' }),
    });
    const offBody = await off.json();
    expect(offBody.mine).toBeNull();
    expect(offBody.counts).toEqual([{ reaction: '❤️', count: 3 }]);
    expect((await reactionRows('p-multi')).filter((r) => r.userId === ALICE)).toEqual([]);

    // The users/pastes fixtures survive untouched.
    const [alice] = await db.select().from(users).where(eq(users.id, ALICE)).limit(1);
    expect(alice.username).toBe('alice');
    expect((await pasteRow('p-multi')).title).toBe('Paste p-multi');
  });
});
