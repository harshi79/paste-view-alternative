/**
 * Password-reset security tests.
 *
 * Core property under test: an attacker who only knows a username — with
 * or without their own valid session — cannot obtain a usable reset token
 * for another account, and therefore cannot reset that account's password.
 *
 * The suite also locks in the remaining security invariants of the flow:
 * one-time use, 30-minute expiry, hash-only storage, rejection of forged
 * tokens, no username enumeration, and the per-account rate limit.
 *
 * These tests run against a throwaway local SQLite database (the libSQL
 * fallback `file:local.db`, resolved from the process CWD, which is
 * pointed at a temp dir before the first DB access) seeded by the app's
 * own `seedIfEmpty` (users: demo/demo1234, nova/novapass1).
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

// Point the local fallback database at a throwaway dir and make sure no
// remote-database env vars leak into the suite. Must run before any
// getDb() call (which happens inside the tests below).
const tmpDir = mkdtempSync(join(tmpdir(), 'vibebin-test-'));
process.chdir(tmpDir);
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.VERCEL;

import { getDb } from '@/lib/db';
import { users, passwordResets } from '@/lib/db/schema';
import {
  consumePasswordReset,
  requestPasswordReset,
} from '@/lib/passwordReset';
import { verifyPassword } from '@/lib/auth';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function userBy(username: string) {
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!u) throw new Error(`test fixture user missing: ${username}`);
  return u;
}

/** All unused, unexpired reset tokens currently live for a user. */
async function liveTokensFor(userId: string) {
  const db = await getDb();
  const now = Date.now();
  const rows = await db.select().from(passwordResets).where(eq(passwordResets.userId, userId));
  return rows.filter((r) => !r.usedAt && r.expiresAt.getTime() > now);
}

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('attacker who only knows a username cannot reset the account', () => {
  it('cannot obtain a reset token without any session (the audit attack)', async () => {
    const nova = await userBy('nova');
    const before = await nova.passwordHash;

    // The exact attack from the audit: unauthenticated request naming the victim.
    const result = await requestPasswordReset({ username: 'nova', sessionUserId: null });

    expect(result.issued).toBe(false);
    if (!result.issued) {
      // Uniform failure — no token of any kind.
      expect('token' in result).toBe(false);
    }
    // No usable token was minted for the victim, so nothing could be consumed.
    expect(await liveTokensFor(nova.id)).toHaveLength(0);
    // The victim's password is untouched.
    const after = await userBy('nova');
    expect(after.passwordHash).toBe(before);
  });

  it('a signed-in attacker cannot reset a different account (cross-account bypass)', async () => {
    const demo = await userBy('demo');
    const nova = await userBy('nova');

    // Attacker holds a valid session for THEIR account, targets the victim.
    const result = await requestPasswordReset({ username: 'nova', sessionUserId: demo.id });

    expect(result.issued).toBe(false);
    if (!result.issued) expect('token' in result).toBe(false);
    expect(await liveTokensFor(nova.id)).toHaveLength(0);
    const after = await userBy('nova');
    expect(await verifyPassword('novapass1', after.passwordHash)).toBe(true);
  });

  it('cannot enumerate usernames: unknown, known, and mismatched all look the same', async () => {
    const demo = await userBy('demo');

    const unknownUnauth = await requestPasswordReset({
      username: 'definitely_not_a_user_xyz',
      sessionUserId: null,
    });
    const knownUnauth = await requestPasswordReset({ username: 'nova', sessionUserId: null });
    const unknownAuthed = await requestPasswordReset({
      username: 'definitely_not_a_user_xyz',
      sessionUserId: demo.id,
    });
    const mismatchedAuthed = await requestPasswordReset({ username: 'nova', sessionUserId: demo.id });

    for (const r of [unknownUnauth, knownUnauth, unknownAuthed, mismatchedAuthed]) {
      // Every denial is tokenless and structurally identical.
      expect(r.issued).toBe(false);
      if (!r.issued) expect('token' in r).toBe(false);
    }
  });
});

describe('legitimate reset (signed in to the account on this device) still works', () => {
  it('issues a token to the account own session and the password is actually changed', async () => {
    const demo = await userBy('demo');
    const oldHash = demo.passwordHash;

    const result = await requestPasswordReset({ username: 'demo', sessionUserId: demo.id });
    expect(result.issued).toBe(true);
    if (!result.issued) throw new Error('unreachable');
    const { token, expiresIn } = result;

    // Token shape: opaque, 256 bits of randomness, 30-minute TTL.
    expect(token).toMatch(/^vbpr_[A-Za-z0-9_-]{43}$/);
    expect(expiresIn).toBe(1800);

    // Exactly one live token, stored only as its SHA-256 hash (never plaintext).
    const live = await liveTokensFor(demo.id);
    expect(live).toHaveLength(1);
    expect(live[0].tokenHash).toBe(sha256(token));
    const db = await getDb();
    const all = await db.select().from(passwordResets).where(eq(passwordResets.userId, demo.id));
    expect(all.some((r) => r.tokenHash === token)).toBe(false);

    // Consume it — the password must change.
    const consumed = await consumePasswordReset(token, 'new-demo-pass-123');
    expect(consumed).toEqual({ ok: true });

    const updated = await userBy('demo');
    expect(updated.passwordHash).not.toBe(oldHash);
    expect(await verifyPassword('new-demo-pass-123', updated.passwordHash)).toBe(true);
    expect(await verifyPassword('demo1234', updated.passwordHash)).toBe(false);
  });

  it('token is one-time: the same token cannot be consumed twice', async () => {
    const demo = await userBy('demo');
    const result = await requestPasswordReset({ username: 'demo', sessionUserId: demo.id });
    expect(result.issued).toBe(true);
    if (!result.issued) throw new Error('unreachable');

    const first = await consumePasswordReset(result.token, 'another-pass-456');
    expect(first).toEqual({ ok: true });

    const second = await consumePasswordReset(result.token, 'evil-pass-789');
    expect(second).toEqual({ ok: false, error: 'used' });

    // Password is the one set by the first (legitimate) consumption.
    const updated = await userBy('demo');
    expect(await verifyPassword('another-pass-456', updated.passwordHash)).toBe(true);
    expect(await verifyPassword('evil-pass-789', updated.passwordHash)).toBe(false);
  });

  it('a fresh token invalidates the previous unused one (no token pile-up)', async () => {
    const demo = await userBy('demo');
    const a = await requestPasswordReset({ username: 'demo', sessionUserId: demo.id });
    expect(a.issued).toBe(true);
    const b = await requestPasswordReset({ username: 'demo', sessionUserId: demo.id });
    expect(b.issued).toBe(true);
    if (a.issued && b.issued) {
      expect(await liveTokensFor(demo.id)).toHaveLength(1);
      // The older token can no longer be consumed.
      expect(await consumePasswordReset(a.token, 'x-password-123')).toEqual({
        ok: false,
        error: 'invalid',
      });
      expect(await consumePasswordReset(b.token, 'y-password-123')).toEqual({ ok: true });
    }
  });
});

describe('token hardening', () => {
  it('forged / guessed tokens are rejected', async () => {
    expect(await consumePasswordReset('vbpr_' + 'A'.repeat(43), 'some-pass-123')).toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(await consumePasswordReset('', 'some-pass-123')).toEqual({
      ok: false,
      error: 'invalid',
    });
  });

  it('expired tokens are rejected', async () => {
    const nova = await userBy('nova');
    const db = await getDb();
    const token = 'vbpr_expired_test_token';
    await db.insert(passwordResets).values({
      id: randomUUID(),
      userId: nova.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() - 1000),
      createdAt: new Date(Date.now() - 31 * 60 * 1000),
    });
    expect(await consumePasswordReset(token, 'some-pass-123')).toEqual({
      ok: false,
      error: 'expired',
    });
  });

  it('per-account rate limit: at most 5 consumable resets per hour', async () => {
    const db = await getDb();
    const [rater] = await db
      .insert(users)
      .values({
        id: randomUUID(),
        username: 'ratecap_user',
        passwordHash: bcrypt.hashSync('rater-pass-123', 10),
        createdAt: new Date(),
      })
      .returning();

    // Five resets can be issued AND consumed within the hour. (The guard
    // counts created rows; replaced-but-unused tokens are removed on
    // re-issue, so the cap bounds consumable password changes to 5/h.)
    for (let i = 0; i < 5; i++) {
      const r = await requestPasswordReset({
        username: 'ratecap_user',
        sessionUserId: rater.id,
      });
      expect(r.issued).toBe(true);
      if (r.issued) {
        expect(await consumePasswordReset(r.token, `pass-${i}-123456`)).toEqual({ ok: true });
      }
    }

    // A sixth reset within the same hour is rate-limited (uniform, tokenless).
    const sixth = await requestPasswordReset({
      username: 'ratecap_user',
      sessionUserId: rater.id,
    });
    expect(sixth.issued).toBe(false);
    if (!sixth.issued) expect('token' in sixth).toBe(false);
  });
});
