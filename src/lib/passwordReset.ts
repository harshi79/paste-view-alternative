import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { getDb } from './db';
import { passwordResets, users } from './db/schema';
import { hashPassword, verifyPassword } from './auth';

const RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_PER_HOUR = 5;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Issues a one-time password-reset token for a user.
 * Only one valid (unused, unexpired) token exists per user at any time —
 * issuing a new one invalidates older ones. Returns the opaque token
 * (the caller delivers it to the user); only its hash is stored.
 */
export async function issuePasswordReset(userId: string): Promise<{ token: string; expiresIn: number }> {
  const db = await getDb();

  // Abuse guard: at most a handful of resets per hour per user.
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [recent] = await db
    .select({ n: sql<number>`count(*)` })
    .from(passwordResets)
    .where(and(eq(passwordResets.userId, userId), gt(passwordResets.createdAt, since)));
  if (Number(recent?.n ?? 0) >= MAX_PER_HOUR) {
    throw new Error('rate-limited');
  }

  const token = 'vbpr_' + randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);

  // Replace any previous (still unused) tokens for this user.
  await db.delete(passwordResets).where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt)));
  await db.insert(passwordResets).values({ id: randomUUID(), userId, tokenHash: sha256(token), expiresAt, createdAt: new Date() });

  return { token, expiresIn: RESET_TTL_MS / 1000 };
}

export type ResetError = 'invalid' | 'expired' | 'used';

/**
 * Atomically consumes a reset token and sets a new password.
 * Invalid, expired and already-used tokens all return a safe error so
 * the caller can show a clear, non-enumerating message.
 */
export async function consumePasswordReset(
  token: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: ResetError }> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, sha256(token)))
    .limit(1);

  if (!row) return { ok: false, error: 'invalid' };
  if (row.usedAt) return { ok: false, error: 'used' };
  if (row.expiresAt.getTime() <= Date.now()) return { ok: false, error: 'expired' };

  const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  if (!user) return { ok: false, error: 'invalid' };

  const passwordHash = await hashPassword(newPassword);

  await db.transaction(async (tx) => {
    // Mark used first so a second, parallel request cannot claim it.
    const [claimed] = await tx
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResets.id, row.id), isNull(passwordResets.usedAt)))
      .returning({ id: passwordResets.id });
    if (!claimed) return; // already consumed by a concurrent request
    await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
  });

  const [after] = await db.select().from(passwordResets).where(eq(passwordResets.id, row.id)).limit(1);
  return after?.usedAt ? { ok: true } : { ok: false, error: 'used' };
}

/** Changes the password after verifying the current one (signed-in flow). */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return { ok: false, error: 'Account not found.' };

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) return { ok: false, error: 'Current password is incorrect.' };

  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  return { ok: true };
}

/** Cleans up expired rows (cheap, indexed by user). */
export async function purgeExpiredResets(): Promise<void> {
  const db = await getDb();
  await db.delete(passwordResets).where(lt(passwordResets.expiresAt, new Date()));
}
