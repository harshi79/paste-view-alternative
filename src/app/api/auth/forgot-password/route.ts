import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { requestPasswordReset, purgeExpiredResets } from '@/lib/passwordReset';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * Starts the password-reset flow.
 *
 * VibeBin accounts have no email address, so the one-time reset link /
 * code is returned to the device that requested it (the same single-user
 * assumption as the login page). Proof of device control is required:
 * the requester must be signed in to the account being reset, so a token
 * is only ever issued to a valid session of that account. Anyone else —
 * an unauthenticated attacker who merely knows the username, or a
 * signed-in user targeting a different account — receives the same
 * uniform `ok:true` response without a token, which also prevents
 * username enumeration.
 */
export async function POST(req: Request) {
  let body: { username?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const username = (body.username || '').trim();

  const db = await getDb();
  await purgeExpiredResets();

  const session = await getSessionUser();
  let result;
  try {
    result = await requestPasswordReset({
      username,
      sessionUserId: session?.user.id ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }

  // Token is only ever returned to the account's own active session.
  // Every other case (unauthenticated, unknown username, username that
  // does not match the session, rate-limited) returns the identical
  // uniform response.
  if (result.issued) {
    return NextResponse.json({ ok: true, resetToken: result.token, expiresIn: result.expiresIn });
  }
  return NextResponse.json({ ok: true });
}
