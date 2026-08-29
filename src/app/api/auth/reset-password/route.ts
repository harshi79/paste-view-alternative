import { NextResponse } from 'next/server';
import { consumePasswordReset, type ResetError } from '@/lib/passwordReset';

export const runtime = 'nodejs';

const RESET_ERROR_MESSAGES: Record<ResetError, string> = {
  invalid: 'This reset link is invalid or was not recognized. Request a new one.',
  expired: 'This reset link has expired. Request a new one.',
  used: 'This reset link has already been used. Request a new one.',
};

/** Completes the reset with a one-time token + new password. */
export async function POST(req: Request) {
  let body: { token?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const token = String(body.token ?? '').trim();
  const password = String(body.password ?? '');
  if (!token) {
    return NextResponse.json({ error: 'Missing reset link.' }, { status: 400 });
  }
  if (password.length < 6 || password.length > 100) {
    return NextResponse.json({ error: 'Password must be 6–100 characters.' }, { status: 400 });
  }

  const result = await consumePasswordReset(token, password);
  if (!result.ok) {
    return NextResponse.json({ error: RESET_ERROR_MESSAGES[result.error] }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
