import path from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import * as schema from './schema';
import { seedIfEmpty } from './seed';

/**
 * VibeBin database layer.
 *
 * - If DATABASE_URL is set (e.g. a Neon Postgres connection string) we connect
 *   over the `postgres` driver, which works great on Vercel + Neon.
 * - Otherwise we fall back to an embedded PGlite database stored in
 *   `.pglite-data/` so the app runs with zero configuration.
 *
 * The schema is created automatically on first use — no migrations to run.
 */
export type DB = PostgresJsDatabase<typeof schema>;

const SCHEMA_STATEMENTS = [
  // Base users table.
  `CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    username_changed_at timestamptz
  )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS username_changed_at timestamptz`,
  // Case-insensitive username uniqueness (covers "Demo" vs "demo").
  `CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username))`,

  `CREATE TABLE IF NOT EXISTS profiles (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name text,
    bio text NOT NULL DEFAULT '',
    bio_enabled boolean NOT NULL DEFAULT true,
    avatar_url text,
    banner_url text,
    banner_type text NOT NULL DEFAULT 'image',
    name_from text NOT NULL DEFAULT '#a78bfa',
    name_to text NOT NULL DEFAULT '#22d3ee',
    name_style text NOT NULL DEFAULT 'gradient',
    name_effect text NOT NULL DEFAULT 'none',
    effect_speed integer NOT NULL DEFAULT 50,
    effect_intensity integer NOT NULL DEFAULT 60,
    accent text NOT NULL DEFAULT '#8b5cf6',
    links jsonb NOT NULL DEFAULT '[]'::jsonb,
    views integer NOT NULL DEFAULT 0
  )`,

  // New columns added in v2 — backfill for existing deployments.
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS effect_speed integer NOT NULL DEFAULT 50`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS effect_intensity integer NOT NULL DEFAULT 60`,

  `CREATE TABLE IF NOT EXISTS pastes (
    id text PRIMARY KEY,
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    title text NOT NULL DEFAULT 'Untitled',
    title_color text,
    format text NOT NULL DEFAULT 'plain',
    content text NOT NULL,
    language text NOT NULL DEFAULT 'plaintext',
    visibility text NOT NULL DEFAULT 'public',
    password_hash text,
    expires_at timestamptz,
    pinned boolean NOT NULL DEFAULT false,
    views integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE pastes ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'plain'`,
  `CREATE INDEX IF NOT EXISTS pastes_user_idx ON pastes (user_id)`,
  `CREATE INDEX IF NOT EXISTS pastes_created_idx ON pastes (created_at)`,

  // Per-IP signup tracking (max 3 accounts per IP).
  `CREATE TABLE IF NOT EXISTS signup_ips (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    ip text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS signup_ips_ip_idx ON signup_ips (ip)`,

  // Admin-managed tags + assignments.
  `CREATE TABLE IF NOT EXISTS tags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    label text NOT NULL UNIQUE,
    color text NOT NULL DEFAULT '#a78bfa',
    effect text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS user_tags (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, tag_id)
  )`,

  // Server sticker pack (for the rich-text editor).
  `CREATE TABLE IF NOT EXISTS stickers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token text NOT NULL UNIQUE,
    url text,
    emoji text,
    label text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
];

const g = globalThis as unknown as { __vibedb?: Promise<DB> };

async function createDb(): Promise<DB> {
  const url = process.env.DATABASE_URL;

  if (url) {
    const postgres = (await import('postgres')).default;
    const isLocal = /(^|@|\/\/)(localhost|127\.0\.0\.1|\[::1\])/.test(url);
    const client = postgres(url, {
      prepare: false, // required behind Neon's connection pooler
      ssl: isLocal ? false : ('require' as const),
    });
    return drizzlePostgres(client, { schema }) as unknown as DB;
  }

  const { PGlite } = await import('@electric-sql/pglite');
  if (process.env.VERCEL) {
    throw new Error(
      'DATABASE_URL is required on Vercel (the embedded dev database needs a writable filesystem). ' +
        'Add your Neon connection string in Vercel → Settings → Environment Variables.',
    );
  }
  const client = new PGlite(path.join(process.cwd(), '.pglite-data'));
  return drizzlePglite(client, { schema }) as unknown as DB;
}

/** Returns the shared database connection, bootstrapping schema + seed data once. */
export function getDb(): Promise<DB> {
  if (!g.__vibedb) {
    g.__vibedb = (async () => {
      const db = await createDb();
      for (const stmt of SCHEMA_STATEMENTS) {
        await db.execute(sql.raw(stmt));
      }
      await seedIfEmpty(db);
      return db;
    })();
  }
  return g.__vibedb;
}
