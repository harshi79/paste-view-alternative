/**
 * Email OTP + password-recovery tests.
 *
 * Covers the security properties of the new recovery system:
 *  - only the SHA-256 hash of the OTP is stored (never the code);
 *  - 10-minute expiry; one-time use; replay rejected;
 *  - request and verification rate limits (OTP brute force blocked);
 *  - recovery responses are uniform for unknown user / no verified email /
 *    wrong code — no enumeration;
 *  - a verified email + correct code yields a working one-time reset token
 *    (end-to-end password change through the existing reset machinery);
 *  - username-only recovery (no verified email) can never produce a code
 *    or a reset token.
 *
 * The email provider is mocked (src/lib/email is replaced with a recording
 * stub); the database is a throwaway local SQLite file in a temp dir,
 * seeded by the app's own seedIfEmpty (same pattern as passwordReset.test.ts).
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

const { emailState } = vi.hoisted(() => ({
  emailState: {
    enabled: true,
    shouldFail: false,
    sent: [] as Array<{ to: string; subject: string; html: string }>,
  },
}));

vi.mock('@/lib/email', () => ({
  isEmailEnabled: () => emailState.enabled,
  sendEmail: async (to: string, subject: string, html: string) => {
    if (emailState.shouldFail) return false;
    emailState.sent.push({ to, subject, html });
    return true;
  },
  otpEmailHtml: (code: string, _context: 'verify' | 'recovery') =>
    `<html><body>CODE:${code}</body></html>`,
}));

// Throwaway local database (before any getDb() call).
const tmpDir = mkdtempSync(join(tmpdir(), 'vibebin-otp-test-'));
process.chdir(tmpDir);
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.VERCEL;

import { getDb } from '@/lib/db';
import { emailVerifications, users } from '@/lib/db/schema';
import { getRecoveryEmail, OTP_TTL_MS, requestOtp, verifyOtp } from '@/lib/emailOtp';
import { verifyPassword } from '@/lib/auth';
import { consumePasswordReset } from '@/lib/passwordReset';

function sha256hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Creates a throwaway user so tests never collide on rate-limit keys. */
async function makeUser(): Promise<{ id: string; username: string; password: string }> {
  const db = await getDb();
  const password = `pass-${randomUUID().slice(0, 8)}`;
  const [u] = await db
    .insert(users)
    .values({
      id: randomUUID(),
      username: `otpu_${randomUUID().slice(0, 12)}`,
      passwordHash: bcrypt.hashSync(password, 10),
      createdAt: new Date(),
    })
    .returning();
  return { id: u.id, username: u.username, password };
}

async function rowFor(userId: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(emailVerifications)
    .where(eq(emailVerifications.userId, userId))
    .limit(1);
  return row ?? null;
}

function lastSent() {
  return emailState.sent[emailState.sent.length - 1];
}

function codeFrom(html: string): string {
  const m = html.match(/CODE:(\d{6})/);
  if (!m) throw new Error('no code in email');
  return m[1];
}

/** Full settings-flow verify: request + correct code → verified email. */
async function verifyEmail(userId: string, email: string): Promise<void> {
  const r = await requestOtp({ purpose: 'verify', userId, email });
  if (!r.ok || !r.sent) throw new Error(`verify request failed: ${JSON.stringify(r)}`);
  const v = await verifyOtp({ purpose: 'verify', userId, code: codeFrom(lastSent().html) });
  if (!v.ok) throw new Error(`verify failed: ${JSON.stringify(v)}`);
}

beforeEach(() => {
  emailState.enabled = true;
  emailState.shouldFail = false;
  emailState.sent.length = 0;
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('settings flow — email verification', () => {
  it('sends a 6-digit code and stores ONLY its sha256 hash with a 10-minute TTL', async () => {
    const u = await makeUser();
    const before = Date.now();
    const r = await requestOtp({ purpose: 'verify', userId: u.id, email: 'user1@example.com' });
    expect(r).toEqual({ ok: true, sent: true });

    const sent = lastSent();
    expect(sent.to).toBe('user1@example.com');
    const code = codeFrom(sent.html);
    expect(code).toMatch(/^\d{6}$/);

    const row = await rowFor(u.id);
    expect(row).not.toBeNull();
    expect(row!.otpHash).toBe(sha256hex(code));
    expect(row!.otpHash).not.toContain(code); // never plaintext
    expect(row!.otpPurpose).toBe('verify');
    expect(row!.emailVerified).toBe(false);
    // The row is written a few ms after `before`, so allow a small upper
    // tolerance; the lower bound pins the real 10-minute expiry.
    const ttl = row!.otpExpiresAt!.getTime() - before;
    expect(ttl).toBeGreaterThan(OTP_TTL_MS - 5000);
    expect(ttl).toBeLessThanOrEqual(OTP_TTL_MS + 5000);
  });

  it('correct code verifies the email and consumes the OTP (replay rejected)', async () => {
    const u = await makeUser();
    const email = 'user2@example.com';
    await requestOtp({ purpose: 'verify', userId: u.id, email });
    const code = codeFrom(lastSent().html);

    const ok = await verifyOtp({ purpose: 'verify', userId: u.id, code });
    expect(ok).toEqual({ ok: true, purpose: 'verify', email });
    const row = await rowFor(u.id);
    expect(row!.emailVerified).toBe(true);
    expect(row!.otpHash).toBeNull();
    expect(await getRecoveryEmail(u.id)).toEqual({ email, verified: true });

    // Replay of the same code must fail.
    const replay = await verifyOtp({ purpose: 'verify', userId: u.id, code });
    expect(replay).toEqual({ ok: false, error: 'invalid-code' });
    expect((await rowFor(u.id))!.emailVerified).toBe(true); // unchanged
  });

  it('wrong codes are rejected; after 5 attempts the OTP is invalidated', async () => {
    const u = await makeUser();
    await requestOtp({ purpose: 'verify', userId: u.id, email: 'user3@example.com' });
    const real = codeFrom(lastSent().html);
    // Five wrong codes, guaranteed different from the real one.
    const wrongList: string[] = [];
    for (let n = 111111; wrongList.length < 5; n++) {
      const c = String(n);
      if (c !== real) wrongList.push(c);
    }
    for (const c of wrongList) {
      expect(await verifyOtp({ purpose: 'verify', userId: u.id, code: c })).toEqual({
        ok: false,
        error: 'invalid-code',
      });
    }
    // Sixth attempt — even with the RIGHT code — is rate-limited, and the
    // pending OTP has been killed.
    expect(await verifyOtp({ purpose: 'verify', userId: u.id, code: real })).toEqual({
      ok: false,
      error: 'rate-limited',
    });
    expect((await rowFor(u.id))!.otpHash).toBeNull();
  });

  it('expired OTPs are rejected', async () => {
    const u = await makeUser();
    await requestOtp({ purpose: 'verify', userId: u.id, email: 'user4@example.com' });
    const code = codeFrom(lastSent().html);
    const db = await getDb();
    await db
      .update(emailVerifications)
      .set({ otpExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(emailVerifications.userId, u.id));
    expect(await verifyOtp({ purpose: 'verify', userId: u.id, code })).toEqual({
      ok: false,
      error: 'invalid-code',
    });
  });

  it('rate-limits OTP requests to 5 per 15 minutes per account', async () => {
    const u = await makeUser();
    for (let i = 0; i < 5; i++) {
      expect(await requestOtp({ purpose: 'verify', userId: u.id, email: `r${i}@example.com` })).toEqual(
        { ok: true, sent: true },
      );
    }
    expect(emailState.sent).toHaveLength(5);
    expect(
      await requestOtp({ purpose: 'verify', userId: u.id, email: 'r5@example.com' }),
    ).toEqual({ ok: false, error: 'rate-limited' });
    expect(emailState.sent).toHaveLength(5); // no sixth email
  });

  it('rejects an email already bound to another account', async () => {
    const a = await makeUser();
    const b = await makeUser();
    await verifyEmail(a.id, 'shared@example.com');
    expect(await requestOtp({ purpose: 'verify', userId: b.id, email: 'shared@example.com' })).toEqual(
      { ok: false, error: 'email-in-use' },
    );
  });

  it('does not store an OTP when delivery is unavailable or fails', async () => {
    const u1 = await makeUser();
    emailState.enabled = false;
    expect(await requestOtp({ purpose: 'verify', userId: u1.id, email: 'x1@example.com' })).toEqual(
      { ok: false, error: 'email-unavailable' },
    );
    expect(await rowFor(u1.id)).toBeNull();

    emailState.enabled = true;
    emailState.shouldFail = true;
    const u2 = await makeUser();
    expect(await requestOtp({ purpose: 'verify', userId: u2.id, email: 'x2@example.com' })).toEqual(
      { ok: false, error: 'email-unavailable' },
    );
    expect(await rowFor(u2.id)).toBeNull();
    expect(emailState.sent).toHaveLength(0);
  });

  it('changing the email re-arms verification (old email no longer verified)', async () => {
    const u = await makeUser();
    await verifyEmail(u.id, 'old@example.com');
    expect(await getRecoveryEmail(u.id)).toEqual({ email: 'old@example.com', verified: true });

    const r = await requestOtp({ purpose: 'verify', userId: u.id, email: 'new@example.com' });
    expect(r).toEqual({ ok: true, sent: true });
    expect(await getRecoveryEmail(u.id)).toEqual({ email: 'new@example.com', verified: false });

    await verifyOtp({ purpose: 'verify', userId: u.id, code: codeFrom(lastSent().html) });
    expect(await getRecoveryEmail(u.id)).toEqual({ email: 'new@example.com', verified: true });
  });
});

describe('recovery flow — password reset via verified email', () => {
  it('username-only without a verified email: uniform no-send, no token (the audit attack)', async () => {
    const u = await makeUser(); // no email row at all
    const known = await requestOtp({ purpose: 'recovery', username: u.username });
    const unknown = await requestOtp({ purpose: 'recovery', username: 'ghost_nobody_xyz' });
    const badEmail = await requestOtp({ purpose: 'recovery', email: 'nobody@example.com' });

    // Identical, tokenless, email-free outcomes — nothing to exploit.
    expect(known).toEqual({ ok: true, sent: false });
    expect(unknown).toEqual({ ok: true, sent: false });
    expect(badEmail).toEqual({ ok: true, sent: false });
    expect(emailState.sent).toHaveLength(0);

    for (const c of ['123456', '000000']) {
      expect(await verifyOtp({ purpose: 'recovery', username: u.username, code: c })).toEqual({
        ok: false,
        error: 'invalid-code',
      });
    }
    // And the password is untouched.
    expect(await verifyPassword('anything-123', (await (await getDb()).select().from(users).where(eq(users.id, u.id)).limit(1))![0].passwordHash)).toBe(false);
  });

  it('verified email + correct code yields a working one-time reset token', async () => {
    const u = await makeUser();
    await verifyEmail(u.id, 'rec1@example.com');

    const r = await requestOtp({ purpose: 'recovery', username: u.username });
    expect(r).toEqual({ ok: true, sent: true });
    expect(lastSent().to).toBe('rec1@example.com');

    const code = codeFrom(lastSent().html);
    const v = await verifyOtp({ purpose: 'recovery', username: u.username, code });
    if (!v.ok || v.purpose !== 'recovery') {
      throw new Error(`recovery verify failed: ${JSON.stringify(v)}`);
    }
    expect(v.resetToken).toMatch(/^vbpr_[A-Za-z0-9_-]{43}$/);
    expect(v.expiresIn).toBe(1800);

    // The OTP is consumed.
    expect((await rowFor(u.id))!.otpHash).toBeNull();

    // The token works through the EXISTING reset endpoint's machinery.
    expect(await consumePasswordReset(v.resetToken, 'brand-new-pass-1')).toEqual({ ok: true });
    const row = (await (await getDb()).select().from(users).where(eq(users.id, u.id)).limit(1))![0];
    expect(await verifyPassword('brand-new-pass-1', row.passwordHash)).toBe(true);
    expect(await verifyPassword(u.password, row.passwordHash)).toBe(false);
  });

  it('recovery addressed by email works identically', async () => {
    const u = await makeUser();
    await verifyEmail(u.id, 'rec2@example.com');

    const r = await requestOtp({ purpose: 'recovery', email: 'rec2@example.com' });
    expect(r).toEqual({ ok: true, sent: true });
    const v = await verifyOtp({
      purpose: 'recovery',
      email: 'rec2@example.com',
      code: codeFrom(lastSent().html),
    });
    expect(v.ok).toBe(true);
  });

  it('recovery failures are uniform and the code is one-time', async () => {
    const u = await makeUser();
    await verifyEmail(u.id, 'rec3@example.com');
    await requestOtp({ purpose: 'recovery', username: u.username });
    const code = codeFrom(lastSent().html);

    // Unknown user, unknown email, wrong code — all byte-identical.
    const unknownUser = await verifyOtp({ purpose: 'recovery', username: 'ghost_nobody_xyz', code });
    const unknownEmail = await verifyOtp({ purpose: 'recovery', email: 'nobody@example.com', code });
    const wrongCode = await verifyOtp({ purpose: 'recovery', username: u.username, code: '999999' });
    expect(unknownUser).toEqual({ ok: false, error: 'invalid-code' });
    expect(unknownEmail).toEqual({ ok: false, error: 'invalid-code' });
    expect(wrongCode).toEqual({ ok: false, error: 'invalid-code' });

    // Right code still works once…
    const ok = await verifyOtp({ purpose: 'recovery', username: u.username, code });
    expect(ok.ok).toBe(true);
    // …and replaying it fails.
    expect(await verifyOtp({ purpose: 'recovery', username: u.username, code })).toEqual({
      ok: false,
      error: 'invalid-code',
    });
  });

  it('recovery verification is rate-limited per account (brute force blocked)', async () => {
    const u = await makeUser();
    await verifyEmail(u.id, 'rec4@example.com'); // NOTE: uses 1 of the 5 attempt budget
    await requestOtp({ purpose: 'recovery', username: u.username });
    const real = codeFrom(lastSent().html);

    const wrongList: string[] = [];
    for (let n = 222221; wrongList.length < 4; n++) {
      const c = String(n);
      if (c !== real) wrongList.push(c);
    }
    for (const c of wrongList) {
      expect(await verifyOtp({ purpose: 'recovery', username: u.username, code: c })).toEqual({
        ok: false,
        error: 'invalid-code',
      });
    }
    // 6th attempt overall (verifyEmail used 1): blocked even with the correct
    // code; OTP invalidated.
    expect(await verifyOtp({ purpose: 'recovery', username: u.username, code: real })).toEqual({
      ok: false,
      error: 'rate-limited',
    });
    expect((await rowFor(u.id))!.otpHash).toBeNull();
  });

  it('recovery requests are rate-limited per mailbox (Resend protection)', async () => {
    const u = await makeUser();
    await verifyEmail(u.id, 'rec5@example.com');
    emailState.sent.length = 0; // ignore the verification mail above

    for (let i = 0; i < 5; i++) {
      expect(await requestOtp({ purpose: 'recovery', username: u.username })).toEqual({
        ok: true,
        sent: true,
      });
    }
    expect(emailState.sent.filter((e) => e.to === 'rec5@example.com')).toHaveLength(5);
    // 6th recovery request must be capped uniformly (no sixth email).
    expect(await requestOtp({ purpose: 'recovery', username: u.username })).toEqual({
      ok: true,
      sent: false,
    });
    expect(emailState.sent.filter((e) => e.to === 'rec5@example.com')).toHaveLength(5);
  });

  it('an UNVERIFIED email never triggers a recovery send', async () => {
    const u = await makeUser();
    // Requested but never verified.
    const r = await requestOtp({ purpose: 'verify', userId: u.id, email: 'pending@example.com' });
    expect(r).toEqual({ ok: true, sent: true });
    emailState.sent.length = 0;

    const byEmail = await requestOtp({ purpose: 'recovery', email: 'pending@example.com' });
    const byUser = await requestOtp({ purpose: 'recovery', username: u.username });
    expect(byEmail).toEqual({ ok: true, sent: false });
    expect(byUser).toEqual({ ok: true, sent: false });
    expect(emailState.sent).toHaveLength(0);
  });
});
