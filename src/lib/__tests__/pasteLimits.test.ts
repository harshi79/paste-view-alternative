/**
 * Regression tests — paste size limits (lines only).
 *
 * The editor and POST /api/pastes share one explicit limit policy
 * (src/lib/pasteLimits.ts): 20,000 lines, NO character limit. The
 * server is the FINAL authority. These tests drive the real route
 * handler against an in-memory SQLite database (the same harness as
 * pasteLinkSecurity.test.ts) and pin:
 *
 *   - within limits → 200, stored byte-for-byte (no truncation)
 *   - large character count (well above old 100k) but under line limit → accepted
 *   - exactly at the line limit → accepted
 *   - above the line limit → 413 with a clear message, nothing stored
 *   - a large but valid paste → stored byte-for-byte
 *   - empty rich docs still rejected with 400 (unchanged behavior)
 *   - the legacy plain path no longer enforces a character limit
 */
import { createClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/lib/db/schema';
import {
  PASTE_MAX_LINES,
  pasteTooLargeMessage,
  richDocLimitExceeded,
} from '@/lib/pasteLimits';
import type { RichDoc } from '@/lib/pasteFormat';

const { testDb } = vi.hoisted(() => {
  const state: { db?: LibSQLDatabase<typeof schema> } = {};
  return { testDb: state };
});

vi.mock('@/lib/db', async () => {
  const { createClient } = await import('@libsql/client');
  const { drizzle } = await import('drizzle-orm/libsql');
  const schema = await import('@/lib/db/schema');
  const client = createClient({ url: 'file::memory:' });
  const db = drizzle(client, { schema });
  testDb.db = db;
  return { getDb: async () => db };
});

vi.mock('@/lib/auth', () => ({
  getSessionUser: async () => null,
  hashPassword: async (password: string) => password,
}));

import { POST } from '@/app/api/pastes/route';

function db(): LibSQLDatabase<typeof schema> {
  if (!testDb.db) throw new Error('test db not initialized');
  return testDb.db;
}

beforeAll(async () => {
  await db().run(sql`
    CREATE TABLE IF NOT EXISTS pastes (
      id TEXT PRIMARY KEY,
      user_id TEXT,
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
});

beforeEach(async () => {
  await db().run(sql`DELETE FROM pastes`);
});

/** A request exactly like the unified editor's submit payload. */
function richRequest(lines: string[]): Request {
  const doc: RichDoc = { v: 1, lines: lines.map((text) => ({ text })) };
  return new Request('http://localhost/api/pastes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Size limit test',
      format: 'rich',
      language: 'plaintext',
      visibility: 'public',
      expiresIn: 'never',
      content: JSON.stringify(doc),
    }),
  });
}

async function storedRows() {
  return db().select().from(schema.pastes);
}

describe('paste size limits — shared policy', () => {
  it('limits are explicit and consistent', () => {
    expect(PASTE_MAX_LINES).toBe(20_000);
    // No character limit: even 150k chars in a single line fits
    expect(richDocLimitExceeded({ v: 1, lines: [{ text: 'x'.repeat(100_000) }] })).toBeNull();
    expect(richDocLimitExceeded({ v: 1, lines: [{ text: 'x'.repeat(150_000) }] })).toBeNull();
    expect(richDocLimitExceeded({ v: 1, lines: [{ text: 'x'.repeat(500_000) }] })).toBeNull();
    expect(
      richDocLimitExceeded({ v: 1, lines: Array.from({ length: 20_001 }, () => ({ text: 'x' })) }),
    ).toBe('lines');
  });

  it('messages name the limit explicitly', () => {
    expect(pasteTooLargeMessage('lines')).toMatch(/20,000/);
  });
});

describe('POST /api/pastes — size validation at the API boundary', () => {
  it('accepts a normal paste and stores it byte-for-byte', async () => {
    const lines = ['one', 'two', 'three'];
    const res = await POST(richRequest(lines));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe('string');
    const [row] = await storedRows();
    expect(row.content).toBe(JSON.stringify({ v: 1, lines: lines.map((text) => ({ text })) }));
  });

  it('accepts a paste well above 100,000 characters but under 20,000 lines', async () => {
    const big = 'a'.repeat(150_000);
    const res = await POST(richRequest([big]));
    expect(res.status).toBe(200);
    const [row] = await storedRows();
    expect(row.content).toBe(JSON.stringify({ v: 1, lines: [{ text: big }] }));
  });

  it('accepts exactly the line limit', async () => {
    const res = await POST(richRequest(Array.from({ length: PASTE_MAX_LINES }, () => 'x')));
    expect(res.status).toBe(200);
  });

  it('accepts one below the line limit (19,999 lines)', async () => {
    const res = await POST(richRequest(Array.from({ length: PASTE_MAX_LINES - 1 }, () => 'x')));
    expect(res.status).toBe(200);
    expect(await storedRows()).toHaveLength(1);
  });

  it('rejects one above the line limit (20,001 lines) with a clear 413 and stores nothing', async () => {
    const res = await POST(richRequest(Array.from({ length: PASTE_MAX_LINES + 1 }, () => 'x')));
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toMatch(/20,000/);
    expect(await storedRows()).toHaveLength(0);
  });

  it('stores a large but valid paste without any truncation', async () => {
    const lines = Array.from({ length: 1_000 }, (_, k) => `line-${k}-${'x'.repeat(90)}`);
    const res = await POST(richRequest(lines));
    expect(res.status).toBe(200);
    const [row] = await storedRows();
    expect(row.content).toBe(JSON.stringify({ v: 1, lines: lines.map((text) => ({ text })) }));
  });

  it('stores a very large character paste without truncation', async () => {
    const bigLine = 'z'.repeat(200_000);
    const res = await POST(richRequest([bigLine]));
    expect(res.status).toBe(200);
    const [row] = await storedRows();
    expect(row.content).toBe(JSON.stringify({ v: 1, lines: [{ text: bigLine }] }));
  });

  it('still rejects empty rich docs with 400 (unchanged behavior)', async () => {
    const res = await POST(richRequest(['']));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/);
  });

  it('legacy plain path now accepts large character content (no char limit)', async () => {
    const res = await POST(
      new Request('http://localhost/api/pastes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          format: 'plain',
          content: 'a'.repeat(150_000),
          language: 'plaintext',
          visibility: 'public',
          expiresIn: 'never',
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await storedRows()).toHaveLength(1);
  });
});
