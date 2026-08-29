import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { sql } from 'drizzle-orm';
import * as schema from './schema';
import { seedIfEmpty } from './seed';

/**
 * VibeBin database layer — Turso/libSQL edition.
 *
 * - If TURSO_DATABASE_URL is set, connect to Turso (HTTP/WebSocket).
 * - Otherwise fall back to a local SQLite file for development.
 *
 * The schema is created automatically on first use — no migrations to run.
 */
export type DB = LibSQLDatabase<typeof schema>;

const SCHEMA_STATEMENTS = [
  // Base users table.
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    username_changed_at INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS profiles (
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

  `CREATE TABLE IF NOT EXISTS password_resets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id)`,

  `CREATE TABLE IF NOT EXISTS pastes (
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
  `CREATE INDEX IF NOT EXISTS pastes_user_idx ON pastes (user_id)`,
  `CREATE INDEX IF NOT EXISTS pastes_created_idx ON pastes (created_at)`,

  // Likes — a paste can be liked or unliked (no dislikes).
  // One like per signed-in user, one per anonymous IP (salted hash).
  `CREATE TABLE IF NOT EXISTS likes (
    id TEXT PRIMARY KEY,
    paste_id TEXT NOT NULL REFERENCES pastes(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    ip_hash TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS likes_paste_idx ON likes (paste_id)`,
  `CREATE INDEX IF NOT EXISTS likes_user_idx ON likes (user_id)`,
  // Partial unique indexes for deduplication
  `CREATE UNIQUE INDEX IF NOT EXISTS likes_paste_user_idx ON likes (paste_id, user_id) WHERE user_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS likes_paste_ip_idx ON likes (paste_id, ip_hash) WHERE ip_hash IS NOT NULL`,

  // Per-IP signup tracking (max 3 accounts per IP).
  `CREATE TABLE IF NOT EXISTS signup_ips (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    ip TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS signup_ips_ip_idx ON signup_ips (ip)`,

  // Admin-managed tags + assignments.
  `CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#a78bfa',
    effect TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS user_tags (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, tag_id)
  )`,

  // Server sticker pack (for the rich-text editor).
  `CREATE TABLE IF NOT EXISTS stickers (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    url TEXT,
    emoji TEXT,
    label TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`,
];

const g = globalThis as unknown as { __vibedb?: Promise<DB> };

async function createDb(): Promise<DB> {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl) {
    // Connect to Turso (remote database)
    const client = createClient({
      url: tursoUrl,
      authToken: tursoToken,
    });
    return drizzle(client, { schema });
  }

  // Local development: use a local SQLite file
  if (process.env.VERCEL) {
    throw new Error(
      'TURSO_DATABASE_URL is required on Vercel. ' +
        'Add your Turso connection string in Vercel → Settings → Environment Variables.',
    );
  }

  const client = createClient({
    url: 'file:local.db',
  });
  return drizzle(client, { schema });
}

/**
 * Returns the shared database connection, bootstrapping schema + seed data
 * once per process.
 */
export async function getDb(): Promise<DB> {
  if (!g.__vibedb) {
    g.__vibedb = (async () => {
      const db = await createDb();

      // Enable foreign key enforcement (SQLite requires this per connection)
      await db.run(sql`PRAGMA foreign_keys = ON`);

      // Check if users table exists
      const exists = await db.all(
        sql`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`,
      );

      if (exists.length > 0) {
        // Existing deployment: schema already exists, just seed if needed
        await seedIfEmpty(db);
        return db;
      }

      // Fresh database: create all tables
      for (const stmt of SCHEMA_STATEMENTS) {
        await db.run(sql.raw(stmt));
      }
      await seedIfEmpty(db);
      return db;
    })();
  }
  return g.__vibedb;
}
