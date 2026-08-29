import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { issuePasswordReset, purgeExpiredResets } from '@/lib/passwordReset';

export const runtime = 'nodejs';

/**
 * Starts the password-reset flow.
 *
 * VibeBin accounts have no email address, so the one-time reset link /
 * code is returned to the device that requested it (the same single-user
 * assumption as the login page). The response for unknown usernames is
 * deliberately generic, and rate-limiting failures also return `ok:true`
 * so the endpoint does not reveal which accounts exist.
 */
export async function POST(req: Request) {
  let body: { username?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const username = (body.username || '').trim();
  if (!username) {
    return NextResponse.json({ ok: true });
  }

  const db = await getDb();
  await purgeExpiredResets();

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = ${username.toLowerCase()}`)
    .limit(1);

  if (!user) {
    // Do not reveal whether the account exists.
    return NextResponse.json({ ok: true });
  }

  try {
    const { token, expiresIn } = await issuePasswordReset(user.id);
    return NextResponse.json({ ok: true, resetToken: token, expiresIn });
  } catch (err) {
    if (err instanceof Error && err.message === 'rate-limited') {
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
