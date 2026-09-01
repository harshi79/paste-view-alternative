/**
 * Notification backend tests (Chat 1 foundation).
 *
 * Covers the event creation path for every supported type and the
 * read/unread API contract:
 *
 *   FOLLOW    — created on a successful follow, never duplicated,
 *               never for a rejected/self/failed follow
 *   LIKE      — created on a successful like by a signed-in user, exact
 *               paste id preserved, no self-like / guest / failed like
 *   NEW_POST  — public pastes fan out to every follower exactly once;
 *               unlisted and password-protected pastes notify nobody;
 *               the author never notifies themselves
 *   READ      — own notifications only, unread count, mark-one,
 *               mark-all, newest-first ordering, keyset pagination
 *
 * Like the follow suite, these run against a throwaway local SQLite
 * database (the libSQL `file:local.db` fallback pointed at a temp dir)
 * seeded by the app's own `seedIfEmpty`, and drive the real route
 * handlers with a mocked cookie jar.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

const tmpDir = mkdtempSync(join(tmpdir(), 'vibebin-notifications-test-'));
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
import { notifications, pastes, profiles, users } from '@/lib/db/schema';
import { createSession, hashPassword } from '@/lib/auth';
import { followUser } from '@/lib/follows';
import { notifyNewPaste } from '@/lib/notifications';
import { POST as followPOST } from '@/app/api/users/[username]/follow/route';
import { POST as likePOST } from '@/app/api/pastes/[id]/like/route';
import { POST as pastePOST } from '@/app/api/pastes/route';
import { GET as listGET } from '@/app/api/notifications/route';
import { GET as latestGET } from '@/app/api/notifications/latest/route';
import { GET as unreadGET } from '@/app/api/notifications/unread-count/route';
import { POST as readOnePOST } from '@/app/api/notifications/[id]/read/route';
import { POST as readAllPOST } from '@/app/api/notifications/read-all/route';

// --- fixtures -------------------------------------------------------------

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

async function loginAs(user: { id: string; username: string }) {
  cookieJar.clear();
  await createSession({ id: user.id, username: user.username });
}

function req(path: string, method = 'POST', body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

async function rowsFor(userId: string) {
  const db = await getDb();
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientUserId, userId));
}

async function rowsOfType(userId: string, type: string) {
  const db = await getDb();
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientUserId, userId), eq(notifications.type, type)));
}

async function insertPaste(ownerId: string | null, overrides: Record<string, unknown> = {}) {
  const db = await getDb();
  const id = `p${randomUUID().slice(0, 8)}`;
  await db.insert(pastes).values({
    id,
    userId: ownerId,
    title: 'Fixture paste',
    format: 'plain',
    content: 'hello',
    language: 'plaintext',
    visibility: 'public',
    createdAt: new Date(),
    ...overrides,
  });
  return id;
}

let alice: { id: string; username: string };
let bob: { id: string; username: string };
let carol: { id: string; username: string };
let dave: { id: string; username: string };

beforeAll(async () => {
  await getDb();
  alice = await createUser('alice');
  bob = await createUser('bob');
  carol = await createUser('carol');
  dave = await createUser('dave');
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// --- FOLLOW ---------------------------------------------------------------

describe('FOLLOW notifications', () => {
  it('creates exactly one notification for the followed user', async () => {
    await loginAs(alice);
    const res = await followPOST(req('/api/users/bob/follow'), {
      params: Promise.resolve({ username: 'bob' }),
    });
    expect(res.status).toBe(200);

    const rows = await rowsOfType(bob.id, 'FOLLOW');
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientUserId).toBe(bob.id); // correct recipient
    expect(rows[0].actorUserId).toBe(alice.id); // correct actor
    expect(rows[0].title).toBe('@alice follows you');
    expect(rows[0].link).toBe('/u/alice');
    expect(rows[0].isRead).toBe(false);
    expect(rows[0].pasteId).toBeNull();
  });

  it('does not duplicate on a repeated follow request', async () => {
    const res = await followPOST(req('/api/users/bob/follow'), {
      params: Promise.resolve({ username: 'bob' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ following: false });
    expect(await rowsOfType(bob.id, 'FOLLOW')).toHaveLength(1);
  });

  it('still rejects self-follow and creates no notification', async () => {
    const res = await followPOST(req('/api/users/alice/follow'), {
      params: Promise.resolve({ username: 'alice' }),
    });
    expect(res.status).toBe(400);
    expect(await rowsOfType(alice.id, 'FOLLOW')).toHaveLength(0);
  });

  it('creates no notification for a failed follow (unknown user)', async () => {
    const before = (await rowsFor(bob.id)).length;
    const res = await followPOST(req('/api/users/nobody/follow'), {
      params: Promise.resolve({ username: 'nobody' }),
    });
    expect(res.status).toBe(404);
    expect((await rowsFor(bob.id)).length).toBe(before);
  });

  it('creates no notification for a guest follow attempt', async () => {
    cookieJar.clear();
    const res = await followPOST(req('/api/users/bob/follow'), {
      params: Promise.resolve({ username: 'bob' }),
    });
    expect(res.status).toBe(401);
    expect(await rowsOfType(bob.id, 'FOLLOW')).toHaveLength(1); // unchanged
  });
});

// --- LIKE -----------------------------------------------------------------

describe('LIKE notifications', () => {
  it('notifies the paste owner and preserves the exact post id', async () => {
    const pasteId = await insertPaste(bob.id, { title: 'Bobs snippet' });
    await loginAs(alice);
    const res = await likePOST(req(`/api/pastes/${pasteId}/like`), {
      params: Promise.resolve({ id: pasteId }),
    });
    expect(res.status).toBe(200);

    const rows = (await rowsOfType(bob.id, 'LIKE')).filter((r) => r.pasteId === pasteId);
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientUserId).toBe(bob.id);
    expect(rows[0].actorUserId).toBe(alice.id);
    expect(rows[0].pasteId).toBe(pasteId); // exact post id
    expect(rows[0].title).toBe('@alice liked your post');
    expect(rows[0].message).toBe('Bobs snippet');
    expect(rows[0].link).toBe(`/p/${pasteId}`);
  });

  it('does not duplicate on repeated like requests', async () => {
    const pasteId = await insertPaste(bob.id);
    await loginAs(alice);
    for (let i = 0; i < 3; i++) {
      const res = await likePOST(req(`/api/pastes/${pasteId}/like`), {
        params: Promise.resolve({ id: pasteId }),
      });
      expect(res.status).toBe(200);
    }
    const rows = (await rowsOfType(bob.id, 'LIKE')).filter((r) => r.pasteId === pasteId);
    expect(rows).toHaveLength(1);
  });

  it('creates no notification for a self-like', async () => {
    const pasteId = await insertPaste(bob.id);
    await loginAs(bob);
    const res = await likePOST(req(`/api/pastes/${pasteId}/like`), {
      params: Promise.resolve({ id: pasteId }),
    });
    expect(res.status).toBe(200);
    const rows = (await rowsFor(bob.id)).filter((r) => r.pasteId === pasteId);
    expect(rows).toHaveLength(0);
  });

  it('creates no notification for a guest like attempt (guests get 401 — likes are the unified ❤️ reaction now)', async () => {
    const pasteId = await insertPaste(bob.id);
    cookieJar.clear();
    const res = await likePOST(req(`/api/pastes/${pasteId}/like`), {
      params: Promise.resolve({ id: pasteId }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).liked).toBeUndefined();
    const rows = (await rowsFor(bob.id)).filter((r) => r.pasteId === pasteId);
    expect(rows).toHaveLength(0);
  });

  it('creates no notification for a failed like (missing / expired paste)', async () => {
    await loginAs(alice);
    const before = (await rowsFor(bob.id)).length;

    const missing = await likePOST(req('/api/pastes/doesnotexist/like'), {
      params: Promise.resolve({ id: 'doesnotexist' }),
    });
    expect(missing.status).toBe(404);

    const expiredId = await insertPaste(bob.id, { expiresAt: new Date(Date.now() - 1000) });
    const expired = await likePOST(req(`/api/pastes/${expiredId}/like`), {
      params: Promise.resolve({ id: expiredId }),
    });
    expect(expired.status).toBe(410);

    expect((await rowsFor(bob.id)).length).toBe(before);
  });

  it('creates no notification for a like on an ownerless (guest) paste', async () => {
    const pasteId = await insertPaste(null);
    await loginAs(alice);
    const res = await likePOST(req(`/api/pastes/${pasteId}/like`), {
      params: Promise.resolve({ id: pasteId }),
    });
    expect(res.status).toBe(200);
    const db = await getDb();
    const rows = await db.select().from(notifications).where(eq(notifications.pasteId, pasteId));
    expect(rows).toHaveLength(0);
  });
});

// --- NEW_POST -------------------------------------------------------------

describe('NEW_POST notifications', () => {
  beforeAll(async () => {
    // alice and bob follow carol; dave follows nobody.
    await followUser(alice.id, carol.id);
    await followUser(bob.id, carol.id);
  });

  async function createPasteAs(
    user: { id: string; username: string },
    body: Record<string, unknown>,
  ) {
    await loginAs(user);
    const res = await pastePOST(
      req('/api/pastes', 'POST', {
        title: 'Post',
        format: 'plain',
        content: 'content',
        language: 'plaintext',
        visibility: 'public',
        expiresIn: 'never',
        ...body,
      }),
    );
    return res;
  }

  it('notifies every follower of a new PUBLIC paste, exactly once each', async () => {
    const res = await createPasteAs(carol, { title: 'Public one' });
    expect(res.status).toBe(200);
    const { id } = await res.json();

    for (const follower of [alice, bob]) {
      const rows = (await rowsOfType(follower.id, 'NEW_POST')).filter((r) => r.pasteId === id);
      expect(rows).toHaveLength(1);
      expect(rows[0].actorUserId).toBe(carol.id);
      expect(rows[0].pasteId).toBe(id); // exact post id preserved
      expect(rows[0].title).toBe('@carol made a new post');
      expect(rows[0].link).toBe(`/p/${id}`);
    }

    // The author is never notified about their own post…
    expect((await rowsOfType(carol.id, 'NEW_POST'))).toHaveLength(0);
    // …and non-followers are not either.
    expect((await rowsOfType(dave.id, 'NEW_POST'))).toHaveLength(0);
  });

  it('is idempotent: re-running the fanout for the same post adds nothing', async () => {
    const res = await createPasteAs(carol, { title: 'Public two' });
    const { id } = await res.json();
    const created = await notifyNewPaste({ id: carol.id, username: carol.username }, { id, title: 'Public two' });
    expect(created).toBe(0);
    for (const follower of [alice, bob]) {
      const rows = (await rowsOfType(follower.id, 'NEW_POST')).filter((r) => r.pasteId === id);
      expect(rows).toHaveLength(1);
    }
  });

  it('notifies nobody for an UNLISTED paste', async () => {
    const res = await createPasteAs(carol, { title: 'Unlisted', visibility: 'unlisted' });
    const { id } = await res.json();
    const db = await getDb();
    expect(await db.select().from(notifications).where(eq(notifications.pasteId, id))).toHaveLength(0);
  });

  it('notifies nobody for a password-PROTECTED paste', async () => {
    const res = await createPasteAs(carol, {
      title: 'Protected',
      passwordProtected: true,
      password: 'secret123',
    });
    const { id } = await res.json();
    const db = await getDb();
    expect(await db.select().from(notifications).where(eq(notifications.pasteId, id))).toHaveLength(0);
  });

  it('notifies nobody when creation fails', async () => {
    const before = (await rowsOfType(alice.id, 'NEW_POST')).length;
    const res = await createPasteAs(carol, { content: '' });
    expect(res.status).toBe(400);
    expect((await rowsOfType(alice.id, 'NEW_POST')).length).toBe(before);
  });

  it('notifies nobody for a guest paste', async () => {
    cookieJar.clear();
    const res = await pastePOST(
      req('/api/pastes', 'POST', {
        title: 'Guest post',
        format: 'plain',
        content: 'anon',
        language: 'plaintext',
        visibility: 'public',
        expiresIn: 'never',
      }),
    );
    expect(res.status).toBe(200);
    const { id } = await res.json();
    const db = await getDb();
    expect(await db.select().from(notifications).where(eq(notifications.pasteId, id))).toHaveLength(0);
  });
});

// --- READ / UNREAD --------------------------------------------------------

describe('notification read state API', () => {
  it('rejects guests on every endpoint', async () => {
    cookieJar.clear();
    expect((await listGET(req('/api/notifications', 'GET'))).status).toBe(401);
    expect((await latestGET(req('/api/notifications/latest', 'GET'))).status).toBe(401);
    expect((await unreadGET()).status).toBe(401);
    expect((await readAllPOST()).status).toBe(401);
    const one = await readOnePOST(req('/api/notifications/x/read'), {
      params: Promise.resolve({ id: 'x' }),
    });
    expect(one.status).toBe(401);
  });

  it('returns only the caller"s own notifications', async () => {
    await loginAs(bob);
    const res = await listGET(req('/api/notifications?limit=50', 'GET'));
    expect(res.status).toBe(200);
    const body = await res.json();
    const own = await rowsFor(bob.id);
    expect(body.notifications.length).toBe(own.length);
    const ownIds = new Set(own.map((r) => r.id));
    for (const n of body.notifications) expect(ownIds.has(n.id)).toBe(true);
  });

  it('exposes actor identity and the post link for the UI', async () => {
    await loginAs(bob);
    const body = await (await listGET(req('/api/notifications?limit=50', 'GET'))).json();
    const follow = body.notifications.find((n: { type: string }) => n.type === 'FOLLOW');
    expect(follow.actor.username).toBe('alice');
    expect(follow.title).toBe('@alice follows you');
    const like = body.notifications.find((n: { type: string }) => n.type === 'LIKE');
    expect(like.pasteId).toBeTruthy();
    expect(like.link).toBe(`/p/${like.pasteId}`);
  });

  it('counts unread notifications and marks one read', async () => {
    await loginAs(bob);
    const before = (await (await unreadGET()).json()).count as number;
    expect(before).toBeGreaterThan(0);

    const target = (await rowsFor(bob.id)).find((r) => !r.isRead)!;
    const res = await readOnePOST(req(`/api/notifications/${target.id}/read`), {
      params: Promise.resolve({ id: target.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unreadCount).toBe(before - 1);
    expect((await (await unreadGET()).json()).count).toBe(before - 1);

    // Idempotent: marking the same one again does not change the count.
    await readOnePOST(req(`/api/notifications/${target.id}/read`), {
      params: Promise.resolve({ id: target.id }),
    });
    expect((await (await unreadGET()).json()).count).toBe(before - 1);
  });

  it("cannot read or mark another user's notification", async () => {
    const bobRow = (await rowsFor(bob.id))[0];
    await loginAs(alice);

    // Not present in alice's list…
    const body = await (await listGET(req('/api/notifications?limit=50', 'GET'))).json();
    expect(body.notifications.some((n: { id: string }) => n.id === bobRow.id)).toBe(false);

    // …and not writable by her either.
    const res = await readOnePOST(req(`/api/notifications/${bobRow.id}/read`), {
      params: Promise.resolve({ id: bobRow.id }),
    });
    expect(res.status).toBe(404);

    const db = await getDb();
    const [after] = await db.select().from(notifications).where(eq(notifications.id, bobRow.id));
    expect(after.isRead).toBe(bobRow.isRead); // unchanged
  });

  it('marks all of the caller"s notifications read (and nobody else"s)', async () => {
    await loginAs(alice);
    const aliceUnreadBefore = (await rowsFor(alice.id)).filter((r) => !r.isRead).length;
    expect(aliceUnreadBefore).toBeGreaterThan(0);
    const bobUnreadBefore = (await rowsFor(bob.id)).filter((r) => !r.isRead).length;

    const res = await readAllPOST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(aliceUnreadBefore);
    expect(body.unreadCount).toBe(0);
    expect((await (await unreadGET()).json()).count).toBe(0);

    // Bob is untouched.
    expect((await rowsFor(bob.id)).filter((r) => !r.isRead).length).toBe(bobUnreadBefore);

    // Idempotent.
    expect((await (await readAllPOST()).json()).updated).toBe(0);
  });
});

describe('notification listing: ordering + pagination', () => {
  let paged: { id: string; username: string };

  beforeAll(async () => {
    paged = await createUser('paged');
    const db = await getDb();
    const base = Date.UTC(2024, 0, 1);
    await db.insert(notifications).values(
      Array.from({ length: 5 }, (_, i) => ({
        id: randomUUID(),
        recipientUserId: paged.id,
        type: 'ADMIN',
        actorUserId: null,
        pasteId: null,
        title: `n${i}`,
        message: '',
        link: null,
        dedupeKey: `TEST:paged:${i}`,
        isRead: false,
        createdAt: new Date(base + i * 1000),
      })),
    );
  });

  it('returns newest-first', async () => {
    await loginAs(paged);
    const body = await (await listGET(req('/api/notifications?limit=50', 'GET'))).json();
    expect(body.notifications.map((n: { title: string }) => n.title)).toEqual([
      'n4',
      'n3',
      'n2',
      'n1',
      'n0',
    ]);
    expect(body.unreadCount).toBe(5);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
  });

  it('pages with a keyset cursor without repeating or skipping rows', async () => {
    await loginAs(paged);
    const seen: string[] = [];
    let cursor: string | null = null;
    let guard = 0;
    do {
      const url: string = `/api/notifications?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const page = await (await listGET(req(url, 'GET'))).json();
      expect(page.notifications.length).toBeLessThanOrEqual(2);
      seen.push(...page.notifications.map((n: { title: string }) => n.title));
      cursor = page.nextCursor;
      guard++;
    } while (cursor && guard < 10);

    expect(seen).toEqual(['n4', 'n3', 'n2', 'n1', 'n0']);
  });

  it('clamps the page size instead of returning everything', async () => {
    await loginAs(paged);
    const body = await (await listGET(req('/api/notifications?limit=9999', 'GET'))).json();
    expect(body.notifications.length).toBeLessThanOrEqual(50);
  });

  it('serves the latest slice plus the unread count for the bell', async () => {
    await loginAs(paged);
    const body = await (await latestGET(req('/api/notifications/latest?limit=2', 'GET'))).json();
    expect(body.notifications.map((n: { title: string }) => n.title)).toEqual(['n4', 'n3']);
    expect(body.unreadCount).toBe(5);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBeTruthy();
  });

  it('supports an unread-only filter', async () => {
    await loginAs(paged);
    const first = (await rowsFor(paged.id)).find((r) => r.title === 'n4')!;
    await readOnePOST(req(`/api/notifications/${first.id}/read`), {
      params: Promise.resolve({ id: first.id }),
    });
    const body = await (
      await listGET(req('/api/notifications?limit=50&filter=unread', 'GET'))
    ).json();
    expect(body.notifications.map((n: { title: string }) => n.title)).toEqual([
      'n3',
      'n2',
      'n1',
      'n0',
    ]);
    expect(body.unreadCount).toBe(4);
  });
});
