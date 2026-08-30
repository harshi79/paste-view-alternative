/**
 * Follow system tests (TODO #1–#4).
 *
 * Covers the follow/unfollow API contract:
 * - guest follow → 401 (client redirects to /register)
 * - logged-in follow / unfollow
 * - duplicate follow prevented (idempotent)
 * - self-follow rejected
 * - nonexistent user → 404
 * - accurate follower/following counts
 * - followers/following list queries with viewer follow state
 * - empty lists
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
import { eq } from 'drizzle-orm';

// Point the local fallback database at a throwaway dir and keep any
// remote-database env vars from leaking into the suite. Must run before
// the first getDb() call.
const tmpDir = mkdtempSync(join(tmpdir(), 'vibebin-follows-test-'));
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
import { users, profiles, pastes, tags, userTags } from '@/lib/db/schema';
import { createSession, hashPassword } from '@/lib/auth';
import {
  countPublicPastes,
  followUser,
  getFollowCounts,
  getFollowList,
  isFollowingUser,
  unfollowUser,
} from '@/lib/follows';
import { POST as followPOST, DELETE as followDELETE } from '@/app/api/users/[username]/follow/route';
import { GET as listGET } from '@/app/api/users/[username]/followers/route';

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
  await db
    .insert(profiles)
    .values({
      userId: user.id,
      displayName: username.toUpperCase(),
      statusEmoji: '🔥',
      statusText: `Status of ${username}`,
    });
  return user;
}

async function userByUsername(username: string) {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!u) throw new Error(`fixture user missing: ${username}`);
  return u;
}

async function loginAs(username: string) {
  const u = await userByUsername(username);
  await createSession({ id: u.id, username: u.username });
}

function jsonRequest(path: string, method: string): Request {
  return new Request(`http://localhost${path}`, { method });
}

let demo: { id: string; username: string };
let nova: { id: string; username: string };
let alice: { id: string; username: string };
let bob: { id: string; username: string };

beforeAll(async () => {
  const db = await getDb();
  demo = await userByUsername('demo');
  nova = await userByUsername('nova');
  alice = await createUser('alice');
  bob = await createUser('bob');
  // Tag alice so list entries exercise the tags join.
  const [tag] = await db
    .insert(tags)
    .values({ id: randomUUID(), label: 'Tester', color: '#fbbf24', effect: 'gold', createdAt: new Date() })
    .returning();
  await db.insert(userTags).values({ userId: alice.id, tagId: tag.id });
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('follow API contract', () => {
  it('rejects guest follow with 401', async () => {
    cookieJar.clear();
    const res = await followPOST(jsonRequest('/api/users/nova/follow', 'POST'), {
      params: Promise.resolve({ username: 'nova' }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('lets a logged-in user follow another profile', async () => {
    await loginAs('demo');
    const res = await followPOST(jsonRequest('/api/users/nova/follow', 'POST'), {
      params: Promise.resolve({ username: 'nova' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.following).toBe(true);
    expect(body.followersCount).toBe(1);

    expect(await isFollowingUser(demo.id, nova.id)).toBe(true);
    const counts = await getFollowCounts(nova.id);
    expect(counts.followers).toBe(1);
    expect(counts.following).toBe(0);
  });

  it('prevents duplicate follows (idempotent)', async () => {
    const res = await followPOST(jsonRequest('/api/users/nova/follow', 'POST'), {
      params: Promise.resolve({ username: 'nova' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // No new row was inserted, count stays accurate at 1.
    expect(body.following).toBe(false);
    expect(body.followersCount).toBe(1);
    expect((await getFollowCounts(nova.id)).followers).toBe(1);
  });

  it('rejects self-follow with 400', async () => {
    const res = await followPOST(jsonRequest('/api/users/demo/follow', 'POST'), {
      params: Promise.resolve({ username: 'demo' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('rejects following a nonexistent user with 404', async () => {
    const res = await followPOST(jsonRequest('/api/users/nobody/follow', 'POST'), {
      params: Promise.resolve({ username: 'nobody' }),
    });
    expect(res.status).toBe(404);
  });

  it('lets the user unfollow, and unfollow is idempotent', async () => {
    let res = await followDELETE(jsonRequest('/api/users/nova/follow', 'DELETE'), {
      params: Promise.resolve({ username: 'nova' }),
    });
    expect(res.status).toBe(200);
    let body = await res.json();
    expect(body.following).toBe(false);
    expect(body.followersCount).toBe(0);
    expect(await isFollowingUser(demo.id, nova.id)).toBe(false);

    // Unfollow again — still fine, still 0.
    res = await followDELETE(jsonRequest('/api/users/nova/follow', 'DELETE'), {
      params: Promise.resolve({ username: 'nova' }),
    });
    expect(res.status).toBe(200);
    body = await res.json();
    expect(body.following).toBe(false);
    expect(body.followersCount).toBe(0);
  });

  it('rejects unfollowing yourself with 400', async () => {
    const res = await followDELETE(jsonRequest('/api/users/demo/follow', 'DELETE'), {
      params: Promise.resolve({ username: 'demo' }),
    });
    expect(res.status).toBe(400);
  });

  it('keeps counts accurate across many relationships', async () => {
    // demo follows nova + alice + bob; alice follows nova; bob follows nova + demo
    await followUser(demo.id, nova.id);
    await followUser(demo.id, alice.id);
    await followUser(demo.id, bob.id);
    await followUser(alice.id, nova.id);
    await followUser(bob.id, nova.id);
    await followUser(bob.id, demo.id);

    const novaCounts = await getFollowCounts(nova.id);
    expect(novaCounts.followers).toBe(3); // demo, alice, bob
    expect(novaCounts.following).toBe(0);

    const demoCounts = await getFollowCounts(demo.id);
    expect(demoCounts.followers).toBe(1); // bob
    expect(demoCounts.following).toBe(3); // nova, alice, bob

    const bobCounts = await getFollowCounts(bob.id);
    expect(bobCounts.following).toBe(2); // nova, demo
  });

  it('self-follow throws in the library layer as a backstop', async () => {
    await expect(followUser(demo.id, demo.id)).rejects.toThrow('SELF_FOLLOW');
  });
});

describe('follow lists', () => {
  it('returns the followers list with viewer follow state', async () => {
    // demo follows nova + alice + bob. Add cara, who follows nova but is
    // NOT followed by the viewer (demo) — her row must show isFollowing false.
    const cara = await createUser('cara');
    await followUser(cara.id, nova.id);

    const list = await getFollowList(nova.id, 'followers', demo.id);
    const names = list.map((u) => u.username).sort();
    expect(names).toEqual(['alice', 'bob', 'cara', 'demo']);

    const aliceEntry = list.find((u) => u.username === 'alice')!;
    expect(aliceEntry.isFollowing).toBe(true);
    expect(aliceEntry.displayName).toBe('ALICE');
    expect(aliceEntry.statusEmoji).toBe('🔥');
    expect(aliceEntry.tags.some((t) => t.label === 'Tester')).toBe(true);

    const caraEntry = list.find((u) => u.username === 'cara')!;
    expect(caraEntry.isFollowing).toBe(false);
  });

  it('returns the following list', async () => {
    const list = await getFollowList(demo.id, 'following', demo.id);
    const names = list.map((u) => u.username).sort();
    expect(names).toEqual(['alice', 'bob', 'nova']);
    // Viewer follows every entry of their own following list.
    expect(list.every((u) => u.isFollowing)).toBe(true);
  });

  it('returns an empty list for a profile nobody follows', async () => {
    const lonely = await createUser('lonely');
    const list = await getFollowList(lonely.id, 'followers', null);
    expect(list).toEqual([]);
    expect(await getFollowList(lonely.id, 'following', null)).toEqual([]);
  });

  it('is public for guests (no viewer → no follow state)', async () => {
    cookieJar.clear();
    const res = await listGET(new Request('http://localhost/api/users/nova/followers?kind=followers'), {
      params: Promise.resolve({ username: 'nova' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toHaveLength(4); // demo, alice, bob, cara
    for (const u of body.users) {
      expect(u.isFollowing).toBe(false);
      expect(u.isOwn).toBe(false);
    }
  });

  it('flags the viewer row as isOwn', async () => {
    await loginAs('demo');
    const res = await listGET(new Request('http://localhost/api/users/nova/followers?kind=followers'), {
      params: Promise.resolve({ username: 'nova' }),
    });
    const body = await res.json();
    const demoEntry = body.users.find((u: { username: string }) => u.username === 'demo');
    expect(demoEntry.isOwn).toBe(true);
  });

  it('404s for a nonexistent profile', async () => {
    const res = await listGET(new Request('http://localhost/api/users/nobody/followers?kind=followers'), {
      params: Promise.resolve({ username: 'nobody' }),
    });
    expect(res.status).toBe(404);
  });

  it('supports kind=following via the API', async () => {
    await loginAs('demo');
    const res = await listGET(new Request('http://localhost/api/users/demo/followers?kind=following'), {
      params: Promise.resolve({ username: 'demo' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users.map((u: { username: string }) => u.username).sort()).toEqual([
      'alice',
      'bob',
      'nova',
    ]);
  });
});

describe('cascade + summary helpers', () => {
  it('removes follow rows when a user is deleted (FK cascade)', async () => {
    const db = await getDb();
    const before = await getFollowCounts(demo.id);
    await db.delete(users).where(eq(users.id, alice.id));
    const after = await getFollowCounts(demo.id);
    expect(after.following).toBe(before.following - 1); // alice no longer followed
    expect((await getFollowCounts(nova.id)).followers).toBe(3); // demo, bob, cara
  });

  it('counts public non-expired pastes for a profile summary', async () => {
    const db = await getDb();
    // demo has 2 seeded public pastes; add an unlisted one that must not count.
    await db.insert(pastes).values({
      id: 'hiddenpaste',
      userId: demo.id,
      title: 'Hidden',
      format: 'plain',
      content: 'x',
      language: 'plaintext',
      visibility: 'unlisted',
      createdAt: new Date(),
    });
    expect(await countPublicPastes(demo.id)).toBe(2);
    // nova has 2 seeded public pastes.
    expect(await countPublicPastes(nova.id)).toBe(2);
  });
});
