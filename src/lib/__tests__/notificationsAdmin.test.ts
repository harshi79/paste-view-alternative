/**
 * Admin broadcast notification tests (Chat 1 foundation).
 *
 * POST /api/admin/notifications sends one notification to every
 * registered user. It reuses the app's existing admin authorization
 * (isAdmin() / the vb_admin cookie), so:
 *
 *   - guests            → 403
 *   - normal members    → 403 (a user session is not an admin session)
 *   - admin             → 200, one ADMIN notification per user
 *
 * Also covers input validation (title/message required, link policy) and
 * the "one broadcast operation = predictable recipient set" guarantee.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

const tmpDir = mkdtempSync(join(tmpdir(), 'vibebin-notifications-admin-test-'));
process.chdir(tmpDir);
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.VERCEL;
process.env.AUTH_SECRET = 'unit-test-secret-0123456789-abcdef0123456789';
process.env.ADMIN_PASSWORD = 'admin-test-password';

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
import { notifications, users } from '@/lib/db/schema';
import { createAdminSession, createSession, hashPassword } from '@/lib/auth';
import { broadcastToAllUsers } from '@/lib/notifications';
import { POST as broadcastPOST } from '@/app/api/admin/notifications/route';

function req(body?: unknown): Request {
  return new Request('http://localhost/api/admin/notifications', {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

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
  return user;
}

async function allUserIds(): Promise<string[]> {
  const db = await getDb();
  return (await db.select({ id: users.id }).from(users)).map((r) => r.id);
}

async function adminRows(userId: string) {
  const db = await getDb();
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientUserId, userId), eq(notifications.type, 'ADMIN')));
}

let member: { id: string; username: string };

beforeAll(async () => {
  await getDb();
  member = await createUser('member');
  await createUser('member2');
});

afterAll(() => {
  delete process.env.ADMIN_PASSWORD;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('admin broadcast authorization', () => {
  it('rejects a guest with 403', async () => {
    cookieJar.clear();
    const res = await broadcastPOST(req({ title: 'Hi', message: 'Everyone' }));
    expect(res.status).toBe(403);
    expect(await adminRows(member.id)).toHaveLength(0);
  });

  it('rejects a normal signed-in user with 403', async () => {
    cookieJar.clear();
    await createSession({ id: member.id, username: member.username });
    const res = await broadcastPOST(req({ title: 'Hi', message: 'Everyone' }));
    expect(res.status).toBe(403);
    expect(await adminRows(member.id)).toHaveLength(0);
  });
});

describe('admin broadcast delivery', () => {
  beforeAll(async () => {
    cookieJar.clear();
    await createAdminSession();
  });

  it('reaches every registered user exactly once', async () => {
    const recipients = await allUserIds();
    const res = await broadcastPOST(
      req({ title: 'Maintenance', message: 'VibeBin will be briefly offline.' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.recipients).toBe(recipients.length);
    expect(body.broadcastId).toBeTruthy();

    for (const id of recipients) {
      const rows = await adminRows(id);
      expect(rows).toHaveLength(1);
      expect(rows[0].title).toBe('Maintenance');
      expect(rows[0].message).toBe('VibeBin will be briefly offline.');
      expect(rows[0].actorUserId).toBeNull();
      expect(rows[0].pasteId).toBeNull();
      expect(rows[0].link).toBeNull();
      expect(rows[0].isRead).toBe(false);
    }
  });

  it('stores the optional link target', async () => {
    const res = await broadcastPOST(
      req({ title: 'Read this', message: 'Details inside.', link: '/p/welcometovb' }),
    );
    expect(res.status).toBe(200);
    const rows = (await adminRows(member.id)).filter((r) => r.title === 'Read this');
    expect(rows).toHaveLength(1);
    expect(rows[0].link).toBe('/p/welcometovb');
  });

  it('rejects an unsafe link', async () => {
    const res = await broadcastPOST(
      req({ title: 'Bad', message: 'Nope', link: 'javascript:alert(1)' }),
    );
    expect(res.status).toBe(400);
    expect((await adminRows(member.id)).some((r) => r.title === 'Bad')).toBe(false);
  });

  it('requires a title and a message', async () => {
    expect((await broadcastPOST(req({ message: 'No title' }))).status).toBe(400);
    expect((await broadcastPOST(req({ title: 'No message' }))).status).toBe(400);
    expect((await broadcastPOST(req())).status).toBe(400);
  });

  it('is idempotent for a replayed broadcast id', async () => {
    const broadcastId = randomUUID();
    const first = await broadcastToAllUsers({
      title: 'Replay',
      message: 'once',
      broadcastId,
    });
    expect(first.recipients).toBe((await allUserIds()).length);
    const second = await broadcastToAllUsers({ title: 'Replay', message: 'once', broadcastId });
    expect(second.recipients).toBe(0);
    expect((await adminRows(member.id)).filter((r) => r.title === 'Replay')).toHaveLength(1);
  });
});
