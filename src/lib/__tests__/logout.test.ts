/**
 * Logout cookie tests (audit BUG #4: logout did not remove the session
 * cookies on HTTPS deployments).
 *
 * Core property under test: the deletion cookie issued by logout must
 * carry the SAME attributes as the cookie login created (domain/path/
 * SameSite/Secure/Partitioned), otherwise browsers — especially for
 * CHIPS partitioned cookies on HTTPS — store the "deleted" cookie in a
 * different slot and the original session cookie stays valid.
 *
 * `next/headers` is mocked with an in-memory cookie jar that RECORDS every
 * set() call (value + attributes) so the tests can compare the creation
 * and deletion attributes directly. No database is needed: with an empty
 * cookie, getSessionUser()/isAdmin() short-circuit before any DB access.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { cookieJar, recordedSets, headerBag } = vi.hoisted(() => ({
  cookieJar: new Map<string, string>(),
  recordedSets: [] as Array<{ name: string; value: string; options: Record<string, unknown> }>,
  headerBag: { current: new Headers() },
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (!cookieJar.has(name)) return undefined;
      return { name, value: cookieJar.get(name) };
    },
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      cookieJar.set(name, value);
      recordedSets.push({ name, value, options: options ?? {} });
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
  headers: async () => headerBag.current,
}));

// These variables must not flip the HTTP/HTTPS detection under test.
delete process.env.VERCEL;
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

// Session issuance requires a valid, strong secret (see src/lib/secret.ts):
// configure a test-only one before the tests run, and remove it afterwards
// so it cannot leak into other test files running in the same worker.
beforeAll(() => {
  process.env.AUTH_SECRET = 'logout-test-secret-0123456789-abcdef0123456789';
});
afterAll(() => {
  delete process.env.AUTH_SECRET;
});

import {
  createAdminSession,
  createSession,
  destroyAdminSession,
  destroySession,
  getSessionUser,
  isAdmin,
} from '@/lib/auth';

const USER_COOKIE = 'vb_session';
const ADMIN_COOKIE = 'vb_admin';

/** Simulates an HTTPS request (reverse proxy / production). */
function httpsContext() {
  headerBag.current = new Headers({ 'x-forwarded-proto': 'https' });
}

/** Simulates a plain HTTP development request. */
function httpContext() {
  headerBag.current = new Headers();
}

function lastSet(name: string) {
  for (let i = recordedSets.length - 1; i >= 0; i--) {
    if (recordedSets[i].name === name) return recordedSets[i];
  }
  throw new Error(`no recorded Set-Cookie for ${name}`);
}

/** Attributes compared between creation and deletion (lifespan fields excluded). */
function cookieAttrs(entry: { options: Record<string, unknown> }): Record<string, unknown> {
  const { maxAge: _maxAge, expires: _expires, ...attrs } = entry.options;
  return attrs;
}

beforeEach(() => {
  cookieJar.clear();
  recordedSets.length = 0;
  httpContext();
});

describe('creation attributes (baseline — security attributes must not weaken)', () => {
  it('HTTPS: vb_session is set with Secure, SameSite=none, Partitioned, HttpOnly', async () => {
    httpsContext();
    await createSession({ id: 'u1', username: 'u1' });
    const entry = lastSet(USER_COOKIE);
    expect(entry.options).toMatchObject({
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      partitioned: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days, unchanged
    });
    expect(entry.value).toMatch(/^eyJ/); // real JWT, not empty
  });

  it('HTTPS: vb_admin is set with Secure, SameSite=none, Partitioned, HttpOnly', async () => {
    httpsContext();
    await createAdminSession();
    const entry = lastSet(ADMIN_COOKIE);
    expect(entry.options).toMatchObject({
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      partitioned: true,
      path: '/',
      maxAge: 60 * 60 * 8, // 8 hours, unchanged
    });
  });

  it('HTTP dev: cookies stay non-secure SameSite=lax (no Secure/Partitioned over plain HTTP)', async () => {
    httpContext();
    await createSession({ id: 'u1', username: 'u1' });
    expect(lastSet(USER_COOKIE).options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      partitioned: false,
      path: '/',
    });
  });
});

describe('deletion attributes match creation attributes (the BUG #4 fix)', () => {
  it('HTTPS: destroySession expires vb_session with the same attributes login used', async () => {
    httpsContext();
    await createSession({ id: 'u1', username: 'u1' });
    const created = lastSet(USER_COOKIE);

    await destroySession();
    const deleted = lastSet(USER_COOKIE);

    // Attribute-for-attribute match — including Partitioned and Secure,
    // which is what makes the browser expire the CHIPS cookie instead of
    // writing an empty cookie to a different slot.
    expect(cookieAttrs(deleted)).toEqual(cookieAttrs(created));
    expect(cookieAttrs(deleted)).toEqual({
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      partitioned: true,
      path: '/',
    });
    // And it is an actual expiration, not a re-issue.
    expect(deleted.value).toBe('');
    expect(deleted.options.maxAge).toBe(0);
    expect(deleted.options.expires).toBeInstanceOf(Date);
    expect((deleted.options.expires as Date).getTime()).toBe(0);
  });

  it('HTTPS: destroyAdminSession expires vb_admin with the same attributes login used', async () => {
    httpsContext();
    await createAdminSession();
    const created = lastSet(ADMIN_COOKIE);

    await destroyAdminSession();
    const deleted = lastSet(ADMIN_COOKIE);

    expect(cookieAttrs(deleted)).toEqual(cookieAttrs(created));
    expect(cookieAttrs(deleted)).toEqual({
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      partitioned: true,
      path: '/',
    });
    expect(deleted.value).toBe('');
    expect(deleted.options.maxAge).toBe(0);
    expect((deleted.options.expires as Date).getTime()).toBe(0);
  });

  it('HTTP dev: destroySession attributes also match (SameSite=lax, non-secure)', async () => {
    httpContext();
    await createSession({ id: 'u1', username: 'u1' });
    const created = lastSet(USER_COOKIE);

    await destroySession();
    const deleted = lastSet(USER_COOKIE);

    expect(cookieAttrs(deleted)).toEqual(cookieAttrs(created));
    expect(cookieAttrs(deleted)).toEqual({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      partitioned: false,
      path: '/',
    });
    expect(deleted.value).toBe('');
    expect(deleted.options.maxAge).toBe(0);
  });

  it('HTTP dev: destroyAdminSession attributes also match', async () => {
    httpContext();
    await createAdminSession();
    const created = lastSet(ADMIN_COOKIE);

    await destroyAdminSession();
    const deleted = lastSet(ADMIN_COOKIE);

    expect(cookieAttrs(deleted)).toEqual(cookieAttrs(created));
    expect(deleted.value).toBe('');
    expect(deleted.options.maxAge).toBe(0);
  });
});

describe('logout behavior', () => {
  it('after logout the session cookie is empty and getSessionUser returns null', async () => {
    httpsContext();
    await createSession({ id: 'u1', username: 'u1' });
    expect(cookieJar.get(USER_COOKIE)).toMatch(/^eyJ/);

    await destroySession();
    expect(cookieJar.get(USER_COOKIE)).toBe('');
    // Empty cookie → the session is gone before any DB lookup.
    expect(await getSessionUser()).toBeNull();
  });

  it('after admin logout the admin cookie is empty and isAdmin returns false', async () => {
    httpsContext();
    await createAdminSession();
    expect(await isAdmin()).toBe(true);

    await destroyAdminSession();
    expect(cookieJar.get(ADMIN_COOKIE)).toBe('');
    expect(await isAdmin()).toBe(false);
  });

  it('logout is safe when no session cookie exists (idempotent)', async () => {
    httpsContext();
    await expect(destroySession()).resolves.toBeUndefined();
    await expect(destroyAdminSession()).resolves.toBeUndefined();
    expect(lastSet(USER_COOKIE).value).toBe('');
    expect(lastSet(ADMIN_COOKIE).value).toBe('');
    expect(await getSessionUser()).toBeNull();
    expect(await isAdmin()).toBe(false);
  });

  it('user logout does not touch the admin cookie and vice versa', async () => {
    httpsContext();
    await createSession({ id: 'u1', username: 'u1' });
    await createAdminSession();

    await destroySession();
    expect(cookieJar.get(USER_COOKIE)).toBe('');
    expect(cookieJar.get(ADMIN_COOKIE)).toMatch(/^eyJ/); // admin untouched
    expect(await isAdmin()).toBe(true);
  });
});
