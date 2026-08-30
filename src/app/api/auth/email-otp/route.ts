import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { requestOtp, type OtpPurpose } from '@/lib/emailOtp';

export const runtime = 'nodejs';

/**
 * Requests a 6-digit email OTP.
 *
 * - purpose 'verify'    (account settings): requires a session; sends the
 *   code to the email the signed-in user wants to use as their recovery
 *   email.
 * - purpose 'recovery'  (forgot password):  no session; sends the code to
 *   the account's VERIFIED recovery email, addressed by username or email.
 *   The response is uniform ({ ok: true }) whether or not a code was
 *   actually sent, so this endpoint never reveals whether an account
 *   exists or has a recovery email.
 */
export async function POST(req: Request) {
  let body: { purpose?: string; email?: string; username?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const purpose: OtpPurpose | null =
    body.purpose === 'verify' || body.purpose === 'recovery' ? body.purpose : null;
  if (!purpose) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const email = typeof body.email === 'string' ? body.email.slice(0, 320) : undefined;
  const username =
    typeof body.username === 'string' ? body.username.trim().slice(0, 60) : undefined;

  if (purpose === 'verify') {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }
    const result = await requestOtp({ purpose, userId: session.user.id, email });
    if (!result.ok) {
      const status = result.error === 'invalid-email' ? 400 : 429;
      const message =
        result.error === 'invalid-email'
          ? 'Please enter a valid email address.'
          : result.error === 'email-in-use'
            ? 'That email is already in use.'
            : result.error === 'email-unavailable'
              ? 'Email delivery is unavailable right now. Try again later.'
              : 'Too many requests. Try again in a few minutes.';
      return NextResponse.json({ error: message }, { status });
    }
    return NextResponse.json({ ok: true });
  }

  // Recovery: uniform response on purpose — never reveal account state.
  const result = await requestOtp({ purpose, email, username });
  if (!result.ok) {
    return NextResponse.json(
      { error: 'Too many requests. Try again in a few minutes.' },
      { status: 429 },
    );
  }
  return NextResponse.json({ ok: true });
}
