import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { changePassword } from '@/lib/passwordReset';

export const runtime = 'nodejs';

/** Signed-in password change — confirms the current password first. */
export async function POST(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const currentPassword = String(body.currentPassword ?? '');
  const newPassword = String(body.newPassword ?? '');
  if (!currentPassword) {
    return NextResponse.json({ error: 'Enter your current password.' }, { status: 400 });
  }
  if (newPassword.length < 6 || newPassword.length > 100) {
    return NextResponse.json({ error: 'New password must be 6–100 characters.' }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ error: 'New password must be different from the current one.' }, { status: 400 });
  }

  const result = await changePassword(session.user.id, currentPassword, newPassword);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
