/**
 * Username reservation tests (TODO #1 — owner-only username reservation).
 *
 * Covers:
 *   - admin can create reservations (and multiple)
 *   - normal users cannot create or delete reservations (403)
 *   - reserved usernames cannot be claimed via register or rename
 *   - case-insensitive reservation matching (register + redirect lookup)
 *   - /u/<reserved> resolves to the owner's real profile (getReservationTarget)
 *   - removing a reservation releases the username
 *   - existing real usernames are never overridden (409)
 *   - duplicate reservations are handled safely (409)
 *   - normal registration/rename behavior is unchanged
 *
 * Runs against a throwaway local SQLite database seeded by `seedIfEmpty`
 * (users: demo, nova) — the same pattern as the other DB-backed suites.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

const tmpDir = mkdtempSync(join(tmpdir(), 'vibebin-reservations-test-'));
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

import { getDb, type DB } from '@/lib/db';
import { users, profiles, usernameReservations } from '@/lib/db/schema';
import { createAdminSession, createSession, hashPassword } from '@/lib/auth';
import { getReservationTarget, isReservedUsername } from '@/lib/usernameReservations';
import { POST as registerPOST } from '@/app/api/auth/register/route';
import { POST as renamePOST } from '@/app/api/account/rename/route';
import {
  GET as listGET,
  POST as reservationsPOST,
  DELETE as reservationsDELETE,
} from '@/app/api/admin/reservations/route';

let db: DB;

beforeAll(async () => {
  db = await getDb();
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function jsonRequest(path: string, method: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

async function createReservation(username: string, targetUsername: string) {
  return reservationsPOST(
    jsonRequest('/api/admin/reservations', 'POST', { username, targetUsername }),
  );
}

async function deleteReservation(id: string) {
  return reservationsDELETE(
    jsonRequest(`/api/admin/reservations?id=${encodeURIComponent(id)}`, 'DELETE'),
  );
}

async function register(username: string, password = 'password123') {
  return registerPOST(jsonRequest('/api/auth/register', 'POST', { username, password }));
}

async function reservationId(username: string): Promise<string | null> {
  const [row] = await db
    .select({ id: usernameReservations.id })
    .from(usernameReservations)
    .where(eq(usernameReservations.username, username.toLowerCase()))
    .limit(1);
  return row?.id ?? null;
}

async function createUser(username: string) {
  const [user] = await db
    .insert(users)
    .values({
      id: randomUUID(),
      username,
      passwordHash: await hashPassword('password123'),
      createdAt: new Date(),
    })
    .returning();
  await db.insert(profiles).values({ userId: user.id, displayName: username });
  return user;
}

async function userByUsername(username: string) {
  const [u] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!u) throw new Error(`fixture user missing: ${username}`);
  return u;
}

describe('admin authorization', () => {
  it('rejects reservation creation for a guest with 403', async () => {
    cookieJar.clear();
    const res = await createReservation('guestalias', 'demo');
    expect(res.status).toBe(403);
  });

  it('rejects reservation creation for a normal signed-in user with 403', async () => {
    cookieJar.clear();
    const member = await userByUsername('demo');
    await createSession({ id: member.id, username: member.username });
    const res = await createReservation('memberalias', 'demo');
    expect(res.status).toBe(403);
    expect(await isReservedUsername(db, 'memberalias')).toBe(false);
  });

  it('rejects reservation deletion for a normal signed-in user with 403', async () => {
    cookieJar.clear();
    // Admin creates a reservation first.
    await createAdminSession();
    const created = await createReservation('todelete', 'demo');
    expect(created.status).toBe(200);
    const id = await reservationId('todelete');
    expect(id).toBeTruthy();

    // Switch to a normal user and attempt to delete it.
    cookieJar.clear();
    const member = await userByUsername('demo');
    await createSession({ id: member.id, username: member.username });
    const res = await deleteReservation(id!);
    expect(res.status).toBe(403);
    expect(await isReservedUsername(db, 'todelete')).toBe(true);
  });
});

describe('admin reservation management', () => {
  beforeAll(async () => {
    cookieJar.clear();
    await createAdminSession();
  });

  it('creates a reservation pointing at the owner profile', async () => {
    const res = await createReservation('vibebin', 'demo');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reservation.username).toBe('vibebin');
    expect(body.reservation.targetUsername).toBe('demo');
    expect(await isReservedUsername(db, 'vibebin')).toBe(true);
  });

  it('creates multiple reservations', async () => {
    for (const name of ['alias_one', 'alias_two', 'alias_three']) {
      const res = await createReservation(name, 'demo');
      expect(res.status).toBe(200);
    }
    expect(await isReservedUsername(db, 'alias_one')).toBe(true);
    expect(await isReservedUsername(db, 'alias_two')).toBe(true);
    expect(await isReservedUsername(db, 'alias_three')).toBe(true);
  });

  it('normalizes reserved names to lowercase and resolves the target canonically', async () => {
    const res = await createReservation('CaseAlias', 'DEMO');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reservation.username).toBe('casealias');
    expect(body.reservation.targetUsername).toBe('demo');
  });

  it('rejects a duplicate reservation case-insensitively with 409', async () => {
    const res = await createReservation('VibeBin', 'demo');
    expect(res.status).toBe(409);
  });

  it('never overrides an existing real username with 409', async () => {
    // 'demo' and 'nova' are real seeded accounts.
    expect((await createReservation('demo', 'nova')).status).toBe(409);
    expect((await createReservation('NOVA', 'demo')).status).toBe(409);
  });

  it('rejects an invalid reserved name with 400', async () => {
    expect((await createReservation('ab', 'demo')).status).toBe(400);
    expect((await createReservation('bad name!', 'demo')).status).toBe(400);
  });

  it('rejects a reservation whose target profile does not exist with 400', async () => {
    expect((await createReservation('ghostalias', 'no-such-user')).status).toBe(400);
  });

  it('lists reservations with their target profiles', async () => {
    const res = await listGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    const names = body.reservations.map((r: { username: string }) => r.username);
    expect(names).toContain('vibebin');
    const row = body.reservations.find((r: { username: string }) => r.username === 'vibebin');
    expect(row.targetUsername).toBe('demo');
  });
});

describe('reservation redirect resolution (/u/<reserved>)', () => {
  it('resolves a reserved name to the owner profile', async () => {
    expect(await getReservationTarget(db, 'vibebin')).toBe('demo');
  });

  it('resolves case-insensitively', async () => {
    expect(await getReservationTarget(db, 'VIBEBIN')).toBe('demo');
    expect(await getReservationTarget(db, 'VibeBin')).toBe('demo');
  });

  it('returns null for an unreserved name', async () => {
    expect(await getReservationTarget(db, 'ordinary_user')).toBeNull();
  });
});

describe('reserved usernames cannot be claimed', () => {
  it('rejects registration of a reserved username with 400', async () => {
    cookieJar.clear();
    const res = await register('vibebin');
    expect(res.status).toBe(400);
  });

  it('rejects registration case-insensitively with 400', async () => {
    cookieJar.clear();
    expect((await register('VIBEBIN')).status).toBe(400);
    expect((await register('VibeBin')).status).toBe(400);
  });

  it('rejects renaming to a reserved username with 400', async () => {
    cookieJar.clear();
    const member = await createUser('renamey');
    await createSession({ id: member.id, username: member.username });
    const res = await renamePOST(
      jsonRequest('/api/account/rename', 'POST', { username: 'vibebin' }),
    );
    expect(res.status).toBe(400);
  });

  it('releases the username once the reservation is removed', async () => {
    // Reserve a fresh name, confirm it is blocked, then remove it.
    cookieJar.clear();
    await createAdminSession();
    expect((await createReservation('release_me', 'demo')).status).toBe(200);
    expect((await register('release_me')).status).toBe(400);

    const id = await reservationId('release_me');
    expect(id).toBeTruthy();
    expect((await deleteReservation(id!)).status).toBe(200);
    expect(await isReservedUsername(db, 'release_me')).toBe(false);

    // Now claimable normally.
    expect((await register('release_me')).status).toBe(200);
  });
});

describe('existing username/profile behavior is unchanged', () => {
  it('still allows normal registration of an unreserved name', async () => {
    cookieJar.clear();
    const res = await register('ordinary_user');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.username).toBe('ordinary_user');
  });

  it('still allows a normal rename to an unreserved name', async () => {
    cookieJar.clear();
    const member = await createUser('renamer_two');
    await createSession({ id: member.id, username: member.username });
    const res = await renamePOST(
      jsonRequest('/api/account/rename', 'POST', { username: 'renamed_ok' }),
    );
    expect(res.status).toBe(200);
    expect(await userByUsername('renamed_ok')).toBeTruthy();
  });

  it('does not create a fake user account for a reservation', async () => {
    const reserved = 'alias_one'; // reserved earlier, target 'demo'
    expect(await isReservedUsername(db, reserved)).toBe(true);
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.username, reserved))
      .limit(1);
    expect(row).toBeUndefined();
  });
});
