/**
 * Bookmark (saved posts) tests.
 *
 * Covers the bookmark API + listing contract:
 * - guests cannot bookmark / unbookmark / read state or lists (401)
 * - logged-in bookmark / unbookmark
 * - duplicate bookmark cannot create duplicates (idempotent)
 * - unbookmark permanently removes the row (and is itself idempotent)
 * - bookmark state is reported correctly
 * - saved-posts list returns ONLY the current user's bookmarks
 * - cross-user bookmark access is impossible (no endpoint takes a user
 *   id; mutations are keyed on the session)
 * - invalid/nonexistent paste ids → 404; expired pastes rejected/hidden
 * - empty saved-posts state
 * - keyset pagination over the saved list
 * - existing paste data is untouched by bookmarking
 * - FK cascades clean up bookmarks when a paste or user is deleted
 *
 * These tests run against a throwaway local SQLite database (the libSQL
 * fallback `file:local.db`, pointed at a temp dir before the first DB
 * access) seeded by the app's own `seedIfEmpty` (users: demo, nova).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';

// Point the local fallback database at a throwaway dir and keep any
// remote-database env vars from leaking into the suite. Must run before
// the first getDb() call.
const tmpDir = mkdtempSync(join(tmpdir(), 'vibebin-bookmarks-test-'));
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

import { getDb } from '@/lib/db';
import { bookmarks, pastes, profiles, users } from '@/lib/db/schema';
import { createSession, hashPassword } from '@/lib/auth';
import {
  bookmarkPaste,
  isBookmarked,
  listBookmarkedPastes,
  unbookmarkPaste,
} from '@/lib/bookmarks';
import {
  POST as bookmarkPOST,
  DELETE as bookmarkDELETE,
  GET as bookmarkGET,
} from '@/app/api/pastes/[id]/bookmark/route';
import { GET as savedGET } from '@/app/api/bookmarks/route';

async function createUser(username: string) {
  const db = await getDb();
  const [user] = await db
    .insert(users)
    .values({
      id: randomUUID(),
      username,
      passwordHash: await hashPassword('password123'),
      createdAt: new Date(),
    })
    .returning();
  await db.insert(profiles).values({ userId: user.id, displayName: username.toUpperCase() });
  return user;
}

async function userByUsername(username: string) {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!u) throw new Error(`fixture user missing: ${username}`);
  return u;
}

let pasteSeq = 0;
async function createPaste(ownerId: string | null, overrides: Partial<typeof pastes.$inferInsert> = {}) {
  const db = await getDb();
  pasteSeq += 1;
  const [paste] = await db
    .insert(pastes)
    .values({
      id: `bmk-paste-${pasteSeq}`,
      userId: ownerId,
      title: `Bookmarkable ${pasteSeq}`,
      format: 'plain',
      content: 'content',
      language: 'plaintext',
      visibility: 'public',
      createdAt: new Date(),
      ...overrides,
    })
    .returning();
  return paste;
}

async function loginAs(username: string) {
  const u = await userByUsername(username);
  await createSession({ id: u.id, username: u.username });
}

function req(path: string, method = 'GET'): Request {
  return new Request(`http://localhost${path}`, { method });
}

function paramsOf(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function bookmarkRowCount(userId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(bookmarks)
    .where(eq(bookmarks.userId, userId));
  return Number(row?.n ?? 0);
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

describe('bookmark API contract — authentication', () => {
  it('rejects every guest call with 401', async () => {
    cookieJar.clear();
    const paste = await createPaste(nova.id);

    const post = await bookmarkPOST(req(`/api/pastes/${paste.id}/bookmark`, 'POST'), paramsOf(paste.id));
    expect(post.status).toBe(401);
    expect((await post.json()).error).toBeTruthy();

    const del = await bookmarkDELETE(req(`/api/pastes/${paste.id}/bookmark`, 'DELETE'), paramsOf(paste.id));
    expect(del.status).toBe(401);

    const state = await bookmarkGET(req(`/api/pastes/${paste.id}/bookmark`), paramsOf(paste.id));
    expect(state.status).toBe(401);

    const list = await savedGET(req('/api/bookmarks'));
    expect(list.status).toBe(401);

    // Nothing was written for anyone.
    expect(await bookmarkRowCount(demo.id)).toBe(0);
    expect(await bookmarkRowCount(nova.id)).toBe(0);
  });
});

describe('bookmark API contract — authenticated', () => {
  it('lets a signed-in user bookmark a post and reports the state', async () => {
    await loginAs('demo');
    const paste = await createPaste(nova.id);

    const res = await bookmarkPOST(req(`/api/pastes/${paste.id}/bookmark`, 'POST'), paramsOf(paste.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.bookmarked).toBe(true);
    expect(body.created).toBe(true);

    expect(await isBookmarked(demo.id, paste.id)).toBe(true);

    const state = await bookmarkGET(req(`/api/pastes/${paste.id}/bookmark`), paramsOf(paste.id));
    expect(state.status).toBe(200);
    expect((await state.json()).bookmarked).toBe(true);
  });

  it('safely ignores duplicate bookmarks (no duplicate rows)', async () => {
    // demo saves one of nova's seeded pastes, then saves it twice more.
    const before = await bookmarkRowCount(demo.id);

    const res = await bookmarkPOST(req('/api/pastes/py-oneliner/bookmark', 'POST'), paramsOf('py-oneliner'));
    expect(res.status).toBe(200);
    const first = await res.json();
    expect(first.created).toBe(true);

    for (let i = 0; i < 2; i++) {
      const dup = await bookmarkPOST(req('/api/pastes/py-oneliner/bookmark', 'POST'), paramsOf('py-oneliner'));
      expect(dup.status).toBe(200);
      const body = await dup.json();
      expect(body.ok).toBe(true);
      expect(body.bookmarked).toBe(true); // the state stays saved
      expect(body.created).toBe(false); // …but no new row was inserted
    }

    expect(await bookmarkRowCount(demo.id)).toBe(before + 1);

    const db = await getDb();
    const rows = await db
      .select({ n: sql<number>`count(*)` })
      .from(bookmarks)
      .where(and(eq(bookmarks.userId, demo.id), eq(bookmarks.pasteId, 'py-oneliner')));
    expect(Number(rows[0]?.n ?? 0)).toBe(1);

    const state = await bookmarkGET(req('/api/pastes/py-oneliner/bookmark'), paramsOf('py-oneliner'));
    expect((await state.json()).bookmarked).toBe(true);

    const { created } = await bookmarkPaste(demo.id, 'py-oneliner');
    expect(created).toBe(false); // library-level idempotency too
  });

  it('unbookmarks permanently and idempotently', async () => {
    const before = await bookmarkRowCount(demo.id);
    expect(before).toBeGreaterThan(0);

    const res = await bookmarkDELETE(req('/api/pastes/py-oneliner/bookmark', 'DELETE'), paramsOf('py-oneliner'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.bookmarked).toBe(false);
    expect(body.removed).toBe(true);

    // The row is permanently gone.
    expect(await isBookmarked(demo.id, 'py-oneliner')).toBe(false);
    expect(await bookmarkRowCount(demo.id)).toBe(before - 1);
    const state = await bookmarkGET(req('/api/pastes/py-oneliner/bookmark'), paramsOf('py-oneliner'));
    expect((await state.json()).bookmarked).toBe(false);

    // Removing it again is a safe no-op.
    const again = await bookmarkDELETE(req('/api/pastes/py-oneliner/bookmark', 'DELETE'), paramsOf('py-oneliner'));
    expect(again.status).toBe(200);
    expect((await again.json()).removed).toBe(false);
    expect(await bookmarkRowCount(demo.id)).toBe(before - 1);
  });

  it('returns 404 for invalid/nonexistent paste ids', async () => {
    await loginAs('demo');
    const post = await bookmarkPOST(req('/api/pastes/no-such-paste/bookmark', 'POST'), paramsOf('no-such-paste'));
    expect(post.status).toBe(404);
    expect((await post.json()).error).toBeTruthy();

    const del = await bookmarkDELETE(req('/api/pastes/no-such-paste/bookmark', 'DELETE'), paramsOf('no-such-paste'));
    expect(del.status).toBe(404);

    const state = await bookmarkGET(req('/api/pastes/no-such-paste/bookmark'), paramsOf('no-such-paste'));
    expect(state.status).toBe(404);
  });

  it('rejects bookmarking an expired paste with 410', async () => {
    const expired = await createPaste(nova.id, { expiresAt: new Date(Date.now() - 60_000) });
    const res = await bookmarkPOST(req(`/api/pastes/${expired.id}/bookmark`, 'POST'), paramsOf(expired.id));
    expect(res.status).toBe(410);
    expect(await isBookmarked(demo.id, expired.id)).toBe(false);
  });

  it('does not change the bookmarked paste itself (views/likes untouched)', async () => {
    const db = await getDb();
    const target = await createPaste(nova.id, { views: 7, likesCount: 3 });
    await bookmarkPaste(demo.id, target.id);
    const [after] = await db.select().from(pastes).where(eq(pastes.id, target.id)).limit(1);
    expect(after.views).toBe(7);
    expect(after.likesCount).toBe(3);
    await unbookmarkPaste(demo.id, target.id);
    const [final] = await db.select().from(pastes).where(eq(pastes.id, target.id)).limit(1);
    expect(final.views).toBe(7);
    expect(final.likesCount).toBe(3);
  });
});

describe('saved posts listing', () => {
  it('returns only the signed-in user’s bookmarks, newest saved first', async () => {
    const db = await getDb();
    const [p1, p2, p3] = await Promise.all([
      createPaste(nova.id, { title: 'First saved' }),
      createPaste(demo.id, { title: 'Second saved' }),
      createPaste(nova.id, { title: 'Nova only' }),
    ]);

    // Deterministic ordering: insert rows with explicit save times.
    await db.insert(bookmarks).values([
      { userId: demo.id, pasteId: p1.id, createdAt: new Date(Date.now() - 120_000) },
      { userId: demo.id, pasteId: p2.id, createdAt: new Date(Date.now() - 60_000) },
      { userId: nova.id, pasteId: p3.id, createdAt: new Date(Date.now() - 30_000) },
    ]);

    await loginAs('demo');
    const res = await savedGET(req('/api/bookmarks'));
    expect(res.status).toBe(200);
    const body = await res.json();

    const demoPage = await listBookmarkedPastes(demo.id);
    const demoIds = demoPage.bookmarks
      .map((b) => b.pasteId)
      .filter((id) => [p1.id, p2.id, p3.id].includes(id));
    expect(demoIds).toEqual([p2.id, p1.id]); // newest saved first

    // The API page contains both of demo's saves…
    const apiIds = body.bookmarks.map((b: { pasteId: string }) => b.pasteId);
    expect(apiIds).toContain(p1.id);
    expect(apiIds).toContain(p2.id);
    // …and NEVER nova's bookmark, even though nova saved hers more recently.
    expect(apiIds).not.toContain(p3.id);

    // Rows carry the card data the saved page renders.
    const row = body.bookmarks.find((b: { pasteId: string }) => b.pasteId === p1.id);
    expect(row.title).toBe('First saved');
    expect(row.language).toBe('plaintext');
    expect(row.author?.username).toBe('nova');

    // Nova's own list has exactly her save.
    await loginAs('nova');
    const novaRes = await savedGET(req('/api/bookmarks'));
    const novaBody = await novaRes.json();
    const novaIds = novaBody.bookmarks.map((b: { pasteId: string }) => b.pasteId);
    expect(novaIds).toContain(p3.id);
    expect(novaIds).not.toContain(p1.id);
    expect(novaIds).not.toContain(p2.id);
  });

  it('returns an empty page for a user with no saved posts', async () => {
    await createUser('bookless');
    await loginAs('bookless');
    const res = await savedGET(req('/api/bookmarks'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.bookmarks).toEqual([]);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();

    const page = await listBookmarkedPastes((await userByUsername('bookless')).id);
    expect(page.bookmarks).toEqual([]);
    expect(page.hasMore).toBe(false);
  });

  it('excludes expired pastes from the saved list', async () => {
    const saver = await createUser('timesaver');
    const alive = await createPaste(nova.id, { title: 'Still here' });
    const dead = await createPaste(nova.id, {
      title: 'Gone',
      expiresAt: new Date(Date.now() - 1000),
    });
    await bookmarkPaste(saver.id, dead.id);
    await bookmarkPaste(saver.id, alive.id);

    const page = await listBookmarkedPastes(saver.id);
    const ids = page.bookmarks.map((b) => b.pasteId);
    expect(ids).toContain(alive.id);
    expect(ids).not.toContain(dead.id);
  });

  it('paginates with a keyset cursor and never repeats rows', async () => {
    const db = await getDb();
    const pager = await createUser('pager');
    const created: string[] = [];
    for (let i = 0; i < 5; i++) {
      const paste = await createPaste(demo.id, { title: `Pageable ${i}` });
      created.push(paste.id);
      await db.insert(bookmarks).values({
        userId: pager.id,
        pasteId: paste.id,
        createdAt: new Date(1_700_000_000_000 + i * 60_000),
      });
    }

    await loginAs('pager');
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let pageNo = 0; pageNo < 3; pageNo++) {
      const url = cursor ? `/api/bookmarks?limit=2&cursor=${encodeURIComponent(cursor)}` : '/api/bookmarks?limit=2';
      const res = await savedGET(req(url));
      expect(res.status).toBe(200);
      const body = await res.json();
      const ids = body.bookmarks.map((b: { pasteId: string }) => b.pasteId) as string[];
      // No row ever repeats across pages.
      for (const id of ids) expect(seen).not.toContain(id);
      seen.push(...ids);
      cursor = body.nextCursor;
      if (!body.hasMore) break;
    }
    expect(seen).toHaveLength(5);
    // Most recently saved first across the whole walk.
    expect(seen).toEqual([...created].reverse());
  });
});

describe('cross-user safety', () => {
  it('one user cannot remove another user’s bookmark', async () => {
    const keep = await createPaste(nova.id, { title: 'Keep mine' });
    await bookmarkPaste(nova.id, keep.id);
    expect(await isBookmarked(nova.id, keep.id)).toBe(true);

    // demo is signed in and sends DELETE for the SAME paste id — the
    // mutation is keyed on demo's own id, so nova's row is untouched.
    await loginAs('demo');
    const res = await bookmarkDELETE(req(`/api/pastes/${keep.id}/bookmark`, 'DELETE'), paramsOf(keep.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.removed).toBe(false); // demo had no bookmark here
    expect(await isBookmarked(nova.id, keep.id)).toBe(true);
    expect(await isBookmarked(demo.id, keep.id)).toBe(false);
  });
});

describe('cascades', () => {
  it('removes bookmarks when the paste is deleted', async () => {
    const db = await getDb();
    const doomed = await createPaste(nova.id, { title: 'Delete me' });
    await bookmarkPaste(demo.id, doomed.id);
    await bookmarkPaste(nova.id, doomed.id);
    await db.delete(pastes).where(eq(pastes.id, doomed.id));
    expect(await isBookmarked(demo.id, doomed.id)).toBe(false);
    expect(await isBookmarked(nova.id, doomed.id)).toBe(false);
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(bookmarks)
      .where(eq(bookmarks.pasteId, doomed.id));
    expect(Number(row?.n ?? 0)).toBe(0);
  });

  it('removes a user’s bookmarks when the user is deleted', async () => {
    const db = await getDb();
    const temp = await createUser('temporary');
    const target = await createPaste(nova.id, { title: 'Orphan bookmark' });
    await bookmarkPaste(temp.id, target.id);
    expect(await bookmarkRowCount(temp.id)).toBe(1);
    await db.delete(users).where(eq(users.id, temp.id));
    expect(await bookmarkRowCount(temp.id)).toBe(0);
    // The paste itself is unaffected — only the bookmark went away.
    const [stillThere] = await db.select().from(pastes).where(eq(pastes.id, target.id)).limit(1);
    expect(stillThere.title).toBe('Orphan bookmark');
  });
});
