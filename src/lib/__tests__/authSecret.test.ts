/**
 * JWT secret configuration tests (audit BUG #2: hardcoded fallback secret).
 *
 * Core property under test: the app NEVER signs or verifies session/admin
 * JWTs with a predictable, default, or committed secret.
 *
 *  - AUTH_SECRET missing / too weak / known-compromised → token issuance
 *    throws (login fails 500) and every presented token is rejected.
 *  - A token signed with the OLD committed fallback secret is rejected,
 *    even by an attacker who can read the repository history.
 *  - Forged vb_session / vb_admin tokens cannot authenticate.
 *  - With a properly configured AUTH_SECRET, the legitimate user and admin
 *    session flows still work (issue → verify round-trips).
 *
 * `next/headers` is mocked with an in-memory cookie jar because
 * cookies()/headers() require a request scope that unit tests do not have.
 * DB-backed assertions run against a throwaway local SQLite database in a
 * temp dir (same pattern as passwordReset.test.ts), seeded by the app's own
 * `seedIfEmpty` (users: demo/demo1234, nova/novapass1).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SignJWT } from 'jose';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const OLD_COMMITTED_SECRET =
  'vibebin-dev-secret-do-not-use-in-production-change-me';
const GOOD_SECRET = 'unit-test-secret-0123456789-abcdef0123456789'; // 44 chars

// --- In-memory cookie store standing in for the Next request scope. ------
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

// --- Throwaway local database (before any getDb() call). -----------------
const tmpDir = mkdtempSync(join(tmpdir(), 'vibebin-secret-test-'));
process.chdir(tmpDir);
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.VERCEL;

import { eq } from 'drizzle-orm';
import { createAdminSession, createSession, getSessionUser, isAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getAuthSecret, getAuthSecretOrNull } from '@/lib/secret';

function enc(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function signedToken(secret: string, payload: Record<string, unknown>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(enc(secret));
}

async function userBy(username: string) {
  const db = await getDb();
  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (!u) throw new Error(`test fixture user missing: ${username}`);
  return u;
}

beforeEach(() => {
  cookieJar.clear();
  delete process.env.AUTH_SECRET;
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('secret configuration (unit)', () => {
  it('throws when AUTH_SECRET is not set', () => {
    expect(() => getAuthSecret()).toThrow(/AUTH_SECRET is not set/);
  });

  it('safe variant returns null when AUTH_SECRET is not set', () => {
    expect(getAuthSecretOrNull()).toBeNull();
  });

  it('rejects a secret shorter than the minimum strength', () => {
    process.env.AUTH_SECRET = 'short';
    expect(() => getAuthSecret()).toThrow(/too weak/);
    expect(getAuthSecretOrNull()).toBeNull();
  });

  it('rejects the old committed fallback secret even when explicitly set', () => {
    process.env.AUTH_SECRET = OLD_COMMITTED_SECRET;
    expect(() => getAuthSecret()).toThrow(/compromised/);
    expect(getAuthSecretOrNull()).toBeNull();
  });

  it('accepts a strong configured secret', () => {
    process.env.AUTH_SECRET = GOOD_SECRET;
    const bytes = getAuthSecret();
    expect(new TextDecoder().decode(bytes)).toBe(GOOD_SECRET);
    expect(getAuthSecretOrNull()).not.toBeNull();
  });
});

describe('forged and legacy tokens cannot authenticate', () => {
  it('rejects a vb_session signed with the OLD committed secret (the audit attack)', async () => {
    process.env.AUTH_SECRET = GOOD_SECRET;
    const nova = await userBy('nova');
    const forged = await signedToken(OLD_COMMITTED_SECRET, {
      uid: nova.id,
      username: nova.username,
    });
    cookieJar.set('vb_session', forged);

    expect(await getSessionUser()).toBeNull();
  });

  it('rejects a forged vb_admin (admin: true) signed with the OLD committed secret', async () => {
    process.env.AUTH_SECRET = GOOD_SECRET;
    const forged = await signedToken(OLD_COMMITTED_SECRET, { admin: true });
    cookieJar.set('vb_admin', forged);

    expect(await isAdmin()).toBe(false);
  });

  it('rejects every token when AUTH_SECRET is not set — even one signed with a strong key', async () => {
    // No secret configured: verification must fail safe, not fall back.
    const nova = await userBy('nova');
    const session = await signedToken(GOOD_SECRET, { uid: nova.id, username: nova.username });
    const admin = await signedToken(GOOD_SECRET, { admin: true });
    cookieJar.set('vb_session', session);
    cookieJar.set('vb_admin', admin);

    expect(await getSessionUser()).toBeNull();
    expect(await isAdmin()).toBe(false);
  });

  it('rejects tokens signed with a weak secret (the key is refused up front)', async () => {
    process.env.AUTH_SECRET = 'short';
    const nova = await userBy('nova');
    const session = await signedToken('short', { uid: nova.id, username: nova.username });
    cookieJar.set('vb_session', session);

    expect(await getSessionUser()).toBeNull();
  });

  it('rejects a vb_session for a user id that does not exist', async () => {
    process.env.AUTH_SECRET = GOOD_SECRET;
    const ghost = await signedToken(GOOD_SECRET, { uid: 'no-such-user-id', username: 'ghost' });
    cookieJar.set('vb_session', ghost);

    expect(await getSessionUser()).toBeNull();
  });
});

describe('legitimate flows with a properly configured AUTH_SECRET', () => {
  it('createSession → getSessionUser round-trip (user login flow)', async () => {
    process.env.AUTH_SECRET = GOOD_SECRET;
    const nova = await userBy('nova');

    await createSession({ id: nova.id, username: nova.username });
    expect(cookieJar.has('vb_session')).toBe(true);

    const session = await getSessionUser();
    expect(session).not.toBeNull();
    expect(session?.user.id).toBe(nova.id);
    expect(session?.user.username).toBe('nova');
    expect(session?.profile).toBeDefined();
  });

  it('createAdminSession → isAdmin round-trip (admin login flow)', async () => {
    process.env.AUTH_SECRET = GOOD_SECRET;
    expect(await isAdmin()).toBe(false);

    await createAdminSession();
    expect(cookieJar.has('vb_admin')).toBe(true);

    expect(await isAdmin()).toBe(true);
  });

  it('a user token is not accepted as an admin token (and vice versa)', async () => {
    process.env.AUTH_SECRET = GOOD_SECRET;
    const nova = await userBy('nova');

    await createSession({ id: nova.id, username: nova.username });
    expect(await isAdmin()).toBe(false); // vb_session does not grant admin

    await createAdminSession();
    const session = await getSessionUser();
    expect(session).not.toBeNull(); // vb_admin does not impersonate a user either
  });
});

describe('issuance fails safe when AUTH_SECRET is missing or invalid', () => {
  it('createSession throws (and sets no cookie) when AUTH_SECRET is not set', async () => {
    await expect(
      createSession({ id: 'whatever', username: 'whatever' }),
    ).rejects.toThrow(/AUTH_SECRET is not set/);
    expect(cookieJar.has('vb_session')).toBe(false);
  });

  it('createAdminSession throws (and sets no cookie) when AUTH_SECRET is not set', async () => {
    await expect(createAdminSession()).rejects.toThrow(/AUTH_SECRET is not set/);
    expect(cookieJar.has('vb_admin')).toBe(false);
  });

  it('createSession throws when AUTH_SECRET is the old committed secret', async () => {
    process.env.AUTH_SECRET = OLD_COMMITTED_SECRET;
    await expect(
      createSession({ id: 'whatever', username: 'whatever' }),
    ).rejects.toThrow(/compromised/);
    expect(cookieJar.has('vb_session')).toBe(false);
  });
});
