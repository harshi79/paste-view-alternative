import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { markAllNotificationsRead } from '@/lib/notifications';

export const runtime = 'nodejs';

/**
 * Mark every notification of the signed-in user read.
 * POST /api/notifications/read-all → { ok, updated, unreadCount: 0 }
 *
 * Only the caller's own rows are touched (recipient comes from the
 * session), and the operation is idempotent.
 */
export async function POST() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const updated = await markAllNotificationsRead(session.user.id);
  return NextResponse.json({ ok: true, updated, unreadCount: 0 });
}
