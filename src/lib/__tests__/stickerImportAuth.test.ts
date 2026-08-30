/**
 * Regression tests for the sticker-import endpoint authorization fix.
 *
 * POST /api/stickers/import used to be unauthenticated: any anonymous
 * visitor could push arbitrary approved-provider stickers into the global
 * pack. The fix gates the endpoint behind the same isAdmin() check that
 * protects /api/admin/stickers.
 *
 * These tests drive the route handler directly with a mocked cookie jar
 * (next/headers) and an in-memory database, covering:
 *
 *   1. Guest request → 403
 *   2. Non-admin authenticated user → 403
 *   3. Admin → import succeeds
 *   4. Trusted-provider validation still applies under admin auth
 *   5. Duplicate / token behavior remains intact under admin auth
 */
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { sql } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as schema from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// Test-only auth secret (strong enough for src/lib/secret.ts).
// ---------------------------------------------------------------------------
const AUTH_SECRET = 'sticker-import-auth-test-secret-0123456789-abcdef';

beforeAll(() => {
  process.env.AUTH_SECRET = AUTH_SECRET;
});
afterAll(() => {
  delete process.env.AUTH_SECRET;
});

// ---------------------------------------------------------------------------
// Mock next/headers with an in-memory cookie jar.
// ---------------------------------------------------------------------------
const cookieJar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      if (!cookieJar.has(name)) return undefined;
      return { name, value: cookieJar.get(name)! };
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

// ---------------------------------------------------------------------------
// Mock DB: in-memory SQLite with the stickers table.
// ---------------------------------------------------------------------------
const client = createClient({ url: 'file::memory:' });
const db = drizzle(client, { schema });

vi.mock('@/lib/db', () => ({
  getDb: async () => db,
}));

// ---------------------------------------------------------------------------
// Mock getGifById to return controlled Giphy data without network calls.
// ---------------------------------------------------------------------------
const VALID_GIPHY_ID = 'abc123valid';
const VALID_GIPHY_URL = 'https://media.giphy.com/media/abc123valid/giphy.gif';

vi.mock('@/lib/gifs', () => ({
  getGifById: async (id: string) => {
    if (id === VALID_GIPHY_ID) {
      return {
        id: VALID_GIPHY_ID,
        url: VALID_GIPHY_URL,
        preview: null,
        label: 'Happy Dance GIF',
      };
    }
    return null;
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function signAdminToken(): Promise<string> {
  return new SignJWT({ admin: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(AUTH_SECRET));
}

async function signUserToken(): Promise<string> {
  return new SignJWT({ uid: 'user-1', username: 'regularuser' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(AUTH_SECRET));
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/stickers/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Import the handler AFTER mocks are registered.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST } = await import('@/app/api/stickers/import/route');

beforeEach(async () => {
  cookieJar.clear();
  await db.run(sql`DROP TABLE IF EXISTS stickers`);
  await db.run(sql`CREATE TABLE stickers (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    url TEXT,
    emoji TEXT,
    label TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/stickers/import — authorization', () => {
  it('rejects guest (no cookies) with 403', async () => {
    const res = await POST(postRequest({ source: 'giphy', id: VALID_GIPHY_ID }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json).toHaveProperty('error');
    // Nothing was written to the stickers table.
    const rows = await db.select().from(schema.stickers);
    expect(rows).toHaveLength(0);
  });

  it('rejects an authenticated non-admin user with 403', async () => {
    const userToken = await signUserToken();
    cookieJar.set('vb_session', userToken);

    const res = await POST(postRequest({ source: 'giphy', id: VALID_GIPHY_ID }));
    expect(res.status).toBe(403);
    const rows = await db.select().from(schema.stickers);
    expect(rows).toHaveLength(0);
  });

  it('rejects a forged admin token with 403', async () => {
    // Signed with a different secret — must fail verification.
    const forged = await new SignJWT({ admin: true })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('wrong-secret-0123456789-abcdef01'));
    cookieJar.set('vb_admin', forged);

    const res = await POST(postRequest({ source: 'giphy', id: VALID_GIPHY_ID }));
    expect(res.status).toBe(403);
  });

  it('allows an authorized admin to import a trusted giphy sticker', async () => {
    const adminToken = await signAdminToken();
    cookieJar.set('vb_admin', adminToken);

    const res = await POST(postRequest({ source: 'giphy', id: VALID_GIPHY_ID }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.existing).toBe(false);
    expect(json.sticker).toMatchObject({
      url: VALID_GIPHY_URL,
      emoji: '🎞️',
    });
    expect(json.sticker.token).toMatch(/^:[a-z0-9_+-]+:$/);

    const rows = await db.select().from(schema.stickers);
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe(VALID_GIPHY_URL);
  });

  it('allows an authorized admin to import a trusted neko sticker', async () => {
    const adminToken = await signAdminToken();
    cookieJar.set('vb_admin', adminToken);

    const res = await POST(
      postRequest({
        source: 'neko',
        category: 'hug',
        url: 'https://nekos.best/api/v2/hug/example.gif',
      }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.existing).toBe(false);
    expect(json.sticker.url).toBe('https://nekos.best/api/v2/hug/example.gif');
  });
});

describe('POST /api/stickers/import — trusted-provider validation (admin)', () => {
  beforeEach(async () => {
    const adminToken = await signAdminToken();
    cookieJar.set('vb_admin', adminToken);
  });

  it('rejects an unknown giphy id (getGifById returns null)', async () => {
    const res = await POST(postRequest({ source: 'giphy', id: 'does-not-exist' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/verified/i);
  });

  it('rejects an untrusted neko URL even when admin', async () => {
    const res = await POST(
      postRequest({
        source: 'neko',
        category: 'hug',
        url: 'https://evil.example/api/v2/hug/bad.gif',
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/verified/i);
    const rows = await db.select().from(schema.stickers);
    expect(rows).toHaveLength(0);
  });

  it('rejects an unsupported source', async () => {
    const res = await POST(postRequest({ source: 'tenor', id: 'xyz' }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid JSON body', async () => {
    const badReq = new Request('http://localhost/api/stickers/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/stickers/import — duplicate / token behavior (admin)', () => {
  beforeEach(async () => {
    const adminToken = await signAdminToken();
    cookieJar.set('vb_admin', adminToken);
  });

  it('returns existing=true and the same sticker on duplicate import', async () => {
    const res1 = await POST(postRequest({ source: 'giphy', id: VALID_GIPHY_ID }));
    expect(res1.status).toBe(201);
    const first = await res1.json();

    const res2 = await POST(postRequest({ source: 'giphy', id: VALID_GIPHY_ID }));
    expect(res2.status).toBe(200);
    const second = await res2.json();

    expect(second.existing).toBe(true);
    expect(second.sticker.id).toBe(first.sticker.id);
    expect(second.sticker.token).toBe(first.sticker.token);

    const rows = await db.select().from(schema.stickers);
    expect(rows).toHaveLength(1);
  });

  it('allocates a collision suffix when the base token is already taken', async () => {
    // Pre-insert a manual sticker that will claim the stem the importer would pick.
    await db.insert(schema.stickers).values({
      id: 'manual-1',
      token: ':happy-dance:',
      url: 'https://example.com/manual.gif',
      emoji: '💃',
      label: 'Manual',
      createdAt: new Date(1),
    });

    const res = await POST(postRequest({ source: 'giphy', id: VALID_GIPHY_ID }));
    expect(res.status).toBe(201);
    const json = await res.json();
    // Must NOT collide with the pre-existing token.
    expect(json.sticker.token).not.toBe(':happy-dance:');
    expect(json.sticker.token).toMatch(/^:[a-z0-9_+-]+:$/);

    const rows = await db.select().from(schema.stickers);
    expect(rows).toHaveLength(2);
    // Manual sticker untouched.
    const manual = rows.find((r) => r.id === 'manual-1');
    expect(manual).toMatchObject({
      token: ':happy-dance:',
      url: 'https://example.com/manual.gif',
    });
  });
});
