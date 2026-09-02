/**
 * Latest discovery feed — data layer + API contract.
 *
 * Ordering MUST be created_at DESC (newest first). Popularity signals
 * (likes, reactions, bookmarks, views, trending score) must never
 * change the order. Pagination is keyset-based and must not duplicate
 * or skip rows. Unlisted / password-protected / expired pastes are
 * excluded. Viewer identity is session-only.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

const tmpDir = mkdtempSync(join(tmpdir(), 'vibebin-latest-test-'));
process.chdir(tmpDir);
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.VERCEL;
process.env.AUTH_SECRET = 'unit-test-secret-0123456789-abcdef0123456789';

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

import { getDb } from '@/lib/db';
import { pastes, profiles, users } from '@/lib/db/schema';
import { createSession, hashPassword } from '@/lib/auth';
import { bookmarkPaste } from '@/lib/bookmarks';
import { listLatestPastes } from '@/lib/feed';
import { pastePreview } from '@/lib/pasteFormat';
import { GET as latestGET } from '@/app/api/pastes/latest/route';
import { setReaction } from '@/lib/reactions';

async function userByUsername(username: string) {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!u) throw new Error(`fixture user missing: ${username}`);
  return u;
}

let pasteSeq = 0;
async function createPaste(
  ownerId: string | null,
  overrides: Partial<typeof pastes.$inferInsert> = {},
) {
  const db = await getDb();
  pasteSeq += 1;
  const [paste] = await db
    .insert(pastes)
    .values({
      id: `latest-${pasteSeq}`,
      userId: ownerId,
      title: `Latest ${pasteSeq}`,
      format: 'plain',
      content: `body for ${pasteSeq}`,
      language: 'plaintext',
      visibility: 'public',
      createdAt: new Date(),
      ...overrides,
    })
    .returning();
  return paste;
}

function req(path: string): Request {
  return new Request(`http://localhost${path}`, { method: 'GET' });
}

let demo: { id: string; username: string };
let nova: { id: string; username: string };

beforeAll(async () => {
  await getDb();
  demo = await userByUsername('demo');
  nova = await userByUsername('nova');
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('pastePreview', () => {
  it('collapses whitespace and truncates without being a second renderer', () => {
    expect(pastePreview('plain', 'hello   world\n\nagain', 200)).toBe('hello world again');
    const long = 'x'.repeat(250);
    const preview = pastePreview('plain', long, 200);
    expect(preview.endsWith('…')).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(201);
    const rich = JSON.stringify({ v: 1, lines: [{ text: 'alpha' }, { text: 'beta' }] });
    expect(pastePreview('rich', rich)).toBe('alpha beta');
  });
});

describe('listLatestPastes — ordering and eligibility', () => {
  it('returns newest-first by created_at, ignoring likes/views/reactions', async () => {
    const now = Date.now();
    const old = await createPaste(nova.id, {
      title: 'Older popular',
      likesCount: 999,
      views: 9999,
      createdAt: new Date(now - 3 * 60 * 60 * 1000),
    });
    const mid = await createPaste(demo.id, {
      title: 'Mid quiet',
      likesCount: 0,
      views: 1,
      createdAt: new Date(now - 2 * 60 * 60 * 1000),
    });
    const newest = await createPaste(nova.id, {
      title: 'Newest unnoticed',
      likesCount: 0,
      views: 0,
      createdAt: new Date(now - 60 * 1000),
    });
    await setReaction(demo.id, old.id, '🔥');

    const page = await listLatestPastes({ limit: 50 });
    const ids = page.pastes.map((p) => p.id);
    const trio = ids.filter((id) => [old.id, mid.id, newest.id].includes(id));
    expect(trio).toEqual([newest.id, mid.id, old.id]);

    for (let i = 1; i < page.pastes.length; i++) {
      expect(page.pastes[i - 1].createdAt).toBeGreaterThanOrEqual(page.pastes[i].createdAt);
    }
  });

  it('excludes unlisted, password-protected, and expired pastes', async () => {
    const visible = await createPaste(demo.id, { title: 'Visible latest' });
    const unlisted = await createPaste(demo.id, { title: 'Hidden', visibility: 'unlisted' });
    const locked = await createPaste(demo.id, { title: 'Locked', passwordHash: 'not-a-real-hash' });
    const expired = await createPaste(demo.id, {
      title: 'Expired',
      expiresAt: new Date(Date.now() - 60_000),
    });

    const page = await listLatestPastes({ limit: 50 });
    const ids = page.pastes.map((p) => p.id);
    expect(ids).toContain(visible.id);
    expect(ids).not.toContain(unlisted.id);
    expect(ids).not.toContain(locked.id);
    expect(ids).not.toContain(expired.id);
    expect(page.pastes.find((p) => p.id === visible.id)?.preview).toContain('body for');
  });

  it('returns an empty page when nothing eligible exists', async () => {
    const db = await getDb();
    const loner = await db
      .insert(users)
      .values({
        id: randomUUID(),
        username: `emptyfeed-${randomUUID().slice(0, 8)}`,
        passwordHash: await hashPassword('password123'),
        createdAt: new Date(),
      })
      .returning();
    await db.insert(profiles).values({ userId: loner[0].id, displayName: 'Empty' });
    // Hide every current public paste by marking them unlisted, then restore? Too
    // destructive. Instead query with a cursor far in the past so the page is empty.
    const page = await listLatestPastes({
      limit: 10,
      cursor: `1_zzzz-empty`,
    });
    expect(page.pastes).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});

describe('listLatestPastes — pagination', () => {
  it('keyset pagination never duplicates or skips rows', async () => {
    const created: string[] = [];
    const base = Date.now() - 10 * 60_000;
    for (let i = 0; i < 5; i++) {
      const paste = await createPaste(demo.id, {
        title: `Page ${i}`,
        createdAt: new Date(base + i * 60_000),
      });
      created.push(paste.id);
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let pageNo = 0; pageNo < 5; pageNo++) {
      const page = await listLatestPastes({ limit: 2, cursor });
      const ids = page.pastes.map((p) => p.id);
      for (const id of ids) expect(seen).not.toContain(id);
      seen.push(...ids);
      cursor = page.nextCursor;
      if (!page.hasMore) break;
    }

    for (const id of created) expect(seen).toContain(id);
    // Newest of this batch appears before older ones (created_at DESC).
    expect(seen.indexOf(created[4])).toBeLessThan(seen.indexOf(created[0]));
  });
});

describe('GET /api/pastes/latest', () => {
  it('is public, newest-first, and ignores a client-supplied userId', async () => {
    cookieJar.clear();
    const res = await latestGET(req('/api/pastes/latest?limit=5&userId=not-a-real-user'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.pastes)).toBe(true);
    expect(body.pastes.length).toBeGreaterThan(0);
    for (let i = 1; i < body.pastes.length; i++) {
      expect(body.pastes[i - 1].createdAt).toBeGreaterThanOrEqual(body.pastes[i].createdAt);
    }
    expect(body.pastes[0].bookmarked).toBe(false);
    expect(body.pastes[0].mineReaction).toBeNull();
  });

  it('uses the session for bookmark state, not a query param', async () => {
    const target = await createPaste(nova.id, { title: 'Session bookmark check' });
    await bookmarkPaste(demo.id, target.id);
    await createSession({ id: demo.id, username: demo.username });

    const res = await latestGET(req('/api/pastes/latest?limit=50'));
    const body = await res.json();
    const row = body.pastes.find((p: { id: string }) => p.id === target.id);
    expect(row.bookmarked).toBe(true);

    cookieJar.clear();
    const guest = await latestGET(req('/api/pastes/latest?limit=50'));
    const guestBody = await guest.json();
    const guestRow = guestBody.pastes.find((p: { id: string }) => p.id === target.id);
    expect(guestRow.bookmarked).toBe(false);
  });
});
