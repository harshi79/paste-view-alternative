import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { verifyOtp, type OtpPurpose } from '@/lib/emailOtp';

export const runtime = 'nodejs';

/**
 * Verifies a 6-digit email OTP.
 *
 * - purpose 'verify'   (account settings): requires the session of the
 *   account the OTP was requested for; success marks the email as the
 *   verified recovery email.
 * - purpose 'recovery' (forgot password):  no session; success consumes the
 *   OTP and returns a one-time reset token (30 minutes, single use) that is
 *   completed through the existing /api/auth/reset-password endpoint.
 *   Every failure (unknown user, no verified email, wrong/expired code,
 *   rate limit) returns the identical body — no enumeration.
 */
export async function POST(req: Request) {
  let body: { purpose?: string; code?: string; email?: string; username?: string };
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
  const code = typeof body.code === 'string' ? body.code.slice(0, 8) : '';
  const email = typeof body.email === 'string' ? body.email.slice(0, 320) : undefined;
  const username =
    typeof body.username === 'string' ? body.username.trim().slice(0, 60) : undefined;

  if (purpose === 'verify') {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    }
    const result = await verifyOtp({ purpose, userId: session.user.id, code });
    if (result.ok && result.purpose === 'verify') {
      return NextResponse.json({ ok: true, verified: true, email: result.email });
    }
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error === 'rate-limited'
          ? 'Too many attempts. Request a new code.'
          : 'Incorrect or expired code.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'Incorrect or expired code.' }, { status: 400 });
  }

  // Recovery: uniform failure body for every reason.
  const result = await verifyOtp({ purpose, email, username, code });
  if (result.ok && result.purpose === 'recovery') {
    return NextResponse.json({
      ok: true,
      resetToken: result.resetToken,
      expiresIn: result.expiresIn,
    });
  }
  return NextResponse.json({ ok: false });
}
