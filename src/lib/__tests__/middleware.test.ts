/**
 * Edge-middleware tests (audit BUG #2: hardcoded fallback secret).
 *
 * The middleware verifies vb_session (user pages) and vb_admin (admin pages)
 * in the edge runtime. These tests pin down its fail-safe behavior:
 *
 *  - A vb_session / vb_admin signed with the OLD committed secret is
 *    rejected → redirect to /login / /admin/login.
 *  - When AUTH_SECRET is not configured, EVERY token is rejected — the
 *    middleware must not fall back to a predictable key.
 *  - With a properly configured AUTH_SECRET, legitimately signed tokens
 *    pass, and /admin/login remains reachable while signed out.
 */
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';

import { middleware } from '../../../middleware';

const OLD_COMMITTED_SECRET =
  'vibebin-dev-secret-do-not-use-in-production-change-me';
const GOOD_SECRET = 'middleware-test-secret-0123456789-abcdef0123456789';

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

function requestFor(path: string, cookieHeader: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieHeader) headers.cookie = cookieHeader;
  return new NextRequest(`http://localhost:3000${path}`, { headers });
}

afterEach(() => {
  delete process.env.AUTH_SECRET;
});

describe('legacy-secret tokens are rejected by the edge guard', () => {
  it('redirects /dashboard → /login for a vb_session signed with the OLD committed secret', async () => {
    process.env.AUTH_SECRET = GOOD_SECRET;
    const forged = await signedToken(OLD_COMMITTED_SECRET, {
      uid: 'any-user-id',
      username: 'anyone',
    });

    const res = await middleware(requestFor('/dashboard', `vb_session=${forged}`));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('redirects /admin → /admin/login for a forged {admin:true} vb_admin (OLD committed secret)', async () => {
    process.env.AUTH_SECRET = GOOD_SECRET;
    const forged = await signedToken(OLD_COMMITTED_SECRET, { admin: true });

    const res = await middleware(requestFor('/admin', `vb_admin=${forged}`));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/admin/login');
  });

  it('a valid user session does not open admin pages', async () => {
    process.env.AUTH_SECRET = GOOD_SECRET;
    const session = await signedToken(GOOD_SECRET, { uid: 'u1', username: 'u1' });

    const res = await middleware(requestFor('/admin', `vb_session=${session}`));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/admin/login');
  });
});

describe('fail-safe when AUTH_SECRET is not configured', () => {
  it('rejects every token on user pages (no silent fallback key)', async () => {
    // Structurally valid, correctly signed — but the app has no secret, so
    // nothing can authenticate.
    const token = await signedToken(GOOD_SECRET, { uid: 'u1', username: 'u1' });
    const res = await middleware(requestFor('/dashboard', `vb_session=${token}`));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('rejects every token on admin pages (no silent fallback key)', async () => {
    const token = await signedToken(GOOD_SECRET, { admin: true });
    const res = await middleware(requestFor('/admin', `vb_admin=${token}`));

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/admin/login');
  });
});

describe('legitimate flows with a properly configured AUTH_SECRET', () => {
  it('allows /dashboard with a correctly signed vb_session', async () => {
    process.env.AUTH_SECRET = GOOD_SECRET;
    const token = await signedToken(GOOD_SECRET, { uid: 'u1', username: 'u1' });

    const res = await middleware(requestFor('/dashboard', `vb_session=${token}`));

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('allows /admin with a correctly signed vb_admin', async () => {
    process.env.AUTH_SECRET = GOOD_SECRET;
    const token = await signedToken(GOOD_SECRET, { admin: true });

    const res = await middleware(requestFor('/admin', `vb_admin=${token}`));

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  it('still redirects signed-out visitors (unchanged behavior)', async () => {
    process.env.AUTH_SECRET = GOOD_SECRET;

    const userPage = await middleware(requestFor('/dashboard', ''));
    expect(userPage.status).toBe(307);
    expect(userPage.headers.get('location')).toContain('/login');

    const adminPage = await middleware(requestFor('/admin/users', ''));
    expect(adminPage.status).toBe(307);
    expect(adminPage.headers.get('location')).toContain('/admin/login');
  });

  it('/admin/login remains reachable while signed out', async () => {
    process.env.AUTH_SECRET = GOOD_SECRET;
    const res = await middleware(requestFor('/admin/login', ''));
    expect(res.status).toBe(200);
  });

  it('untouched routes pass through', async () => {
    process.env.AUTH_SECRET = GOOD_SECRET;
    const res = await middleware(requestFor('/anything-else', ''));
    expect(res.status).toBe(200);
  });
});
