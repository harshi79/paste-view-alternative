/**
 * Regression tests — 6-month maximum retention (change #3).
 *
 * Pastes are automatically removed once they are older than 6 months, on
 * top of (and independent from) the user-selected `expiresAt`. The rule is
 * applied inside `purgeExpired` (reused by the existing throttled
 * `purgeExpiredIfDue` cleanup on paste read paths), so it shares the same
 * lazy, indexed deletion path and cascade conventions as normal expiry.
 *
 * These tests pin:
 *   - the pure boundary predicate (`isPastRetention`) at exact edges
 *   - the SQL purge removing pastes older than 6 months
 *   - newer pastes surviving
 *   - normal-expiry behavior still working unchanged
 *   - unrelated records (users, stickers) being untouched
 *   - associated data (likes) cascading away for removed pastes
 *   - repeated purge being idempotent
 */
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/lib/db/schema';
import { isPastRetention, purgeExpired, PASTE_RETENTION_MS } from '@/lib/pastes';
import type { DB } from '@/lib/db';

let db: DB;

const DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  const client = createClient({ url: 'file::memory:' });
  db = drizzle(client, { schema });
  await db.run(sql`PRAGMA foreign_keys = ON`);
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      username_changed_at INTEGER
    )
  `);
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS stickers (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      url TEXT,
      emoji TEXT,
      label TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    )
  `);
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS pastes (
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
    )
  `);
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS likes (
      id TEXT PRIMARY KEY,
      paste_id TEXT NOT NULL REFERENCES pastes(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      ip_hash TEXT,
      created_at INTEGER NOT NULL
    )
  `);
});

beforeEach(async () => {
  await db.run(sql`DELETE FROM likes`);
  await db.run(sql`DELETE FROM pastes`);
  await db.run(sql`DELETE FROM stickers`);
  await db.run(sql`DELETE FROM users`);
});

/** Inserts a paste with explicit createdAt/expiresAt (both as Date). */
async function insertPaste(opts: {
  id: string;
  createdAt: Date;
  expiresAt?: Date | null;
  userId?: string | null;
}) {
  await db.insert(schema.pastes).values({
    id: opts.id,
    userId: opts.userId ?? null,
    title: 't',
    format: 'plain',
    content: 'x',
    language: 'plaintext',
    visibility: 'public',
    expiresAt: opts.expiresAt ?? null,
    pinned: false,
    views: 0,
    likesCount: 0,
    createdAt: opts.createdAt,
  });
}

async function pasteIds(): Promise<string[]> {
  const rows = await db.select({ id: schema.pastes.id }).from(schema.pastes);
  return rows.map((r) => r.id);
}

describe('isPastRetention — exact boundary predicate', () => {
  const NOW = 1_800_000_000_000;

  it('is false for pastes younger than 6 months', () => {
    expect(isPastRetention(new Date(NOW - PASTE_RETENTION_MS + 1), NOW)).toBe(false);
  });

  it('is false exactly at the 6-month boundary (strictly "older than")', () => {
    expect(isPastRetention(new Date(NOW - PASTE_RETENTION_MS), NOW)).toBe(false);
  });

  it('is true for pastes older than 6 months', () => {
    expect(isPastRetention(new Date(NOW - PASTE_RETENTION_MS - 1), NOW)).toBe(true);
  });
});

describe('purgeExpired — 6-month retention cleanup', () => {
  it('removes a paste older than 6 months (never-expire)', async () => {
    await insertPaste({
      id: 'old',
      createdAt: new Date(Date.now() - PASTE_RETENTION_MS - DAY),
      expiresAt: null,
    });
    await insertPaste({ id: 'recent', createdAt: new Date() });
    await purgeExpired(db);
    expect(await pasteIds()).toEqual(['recent']);
  });

  it('keeps a paste younger than 6 months', async () => {
    await insertPaste({
      id: 'young',
      createdAt: new Date(Date.now() - PASTE_RETENTION_MS + DAY),
    });
    await purgeExpired(db);
    expect(await pasteIds()).toEqual(['young']);
  });

  it('still removes pastes past their normal expiry (unchanged behavior)', async () => {
    await insertPaste({
      id: 'expired',
      createdAt: new Date(), // recent — not past retention
      expiresAt: new Date(Date.now() - 60_000),
    });
    await insertPaste({
      id: 'future',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + DAY),
    });
    await purgeExpired(db);
    expect(await pasteIds()).toEqual(['future']);
  });

  it('removes a paste that is both old and past expiry exactly once', async () => {
    await insertPaste({
      id: 'old-expired',
      createdAt: new Date(Date.now() - PASTE_RETENTION_MS - DAY),
      expiresAt: new Date(Date.now() - DAY),
    });
    await purgeExpired(db);
    expect(await pasteIds()).toEqual([]);
    // idempotent: running again changes nothing
    await purgeExpired(db);
    expect(await pasteIds()).toEqual([]);
  });

  it('does not delete unrelated records (users, stickers)', async () => {
    await db.insert(schema.users).values({
      id: 'u1',
      username: 'alice',
      passwordHash: 'h',
      createdAt: new Date(Date.now() - PASTE_RETENTION_MS - DAY * 10),
    });
    await db.insert(schema.stickers).values({
      id: 's1',
      token: ':wave:',
      label: 'wave',
      createdAt: new Date(Date.now() - PASTE_RETENTION_MS - DAY * 10),
    });
    await insertPaste({
      id: 'old',
      createdAt: new Date(Date.now() - PASTE_RETENTION_MS - DAY),
    });
    await purgeExpired(db);

    expect(await pasteIds()).toEqual([]);
    const users = await db.select({ id: schema.users.id }).from(schema.users);
    const stickers = await db.select({ id: schema.stickers.id }).from(schema.stickers);
    expect(users.map((u) => u.id)).toEqual(['u1']);
    expect(stickers.map((s) => s.id)).toEqual(['s1']);
  });

  it('cascades away associated likes for removed pastes only', async () => {
    await insertPaste({
      id: 'old',
      createdAt: new Date(Date.now() - PASTE_RETENTION_MS - DAY),
    });
    await insertPaste({ id: 'recent', createdAt: new Date() });
    await db.insert(schema.likes).values([
      { id: 'l1', pasteId: 'old', createdAt: new Date() },
      { id: 'l2', pasteId: 'recent', createdAt: new Date() },
    ]);
    await purgeExpired(db);

    const likes = await db.select({ id: schema.likes.id }).from(schema.likes);
    expect(likes.map((l) => l.id)).toEqual(['l2']);
  });
});
