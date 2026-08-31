import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getUnreadCount, markNotificationRead } from '@/lib/notifications';

export const runtime = 'nodejs';

type Props = { params: Promise<{ id: string }> };

/**
 * Mark ONE notification read.
 * POST /api/notifications/<id>/read
 *
 * The update is scoped to (id AND recipient = session user), so a user
 * can never flip another user's read state: a foreign or unknown id
 * matches nothing and answers 404 — the same response either way, so the
 * endpoint does not leak whether the id exists.
 */
export async function POST(_req: Request, { params }: Props) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const updated = await markNotificationRead(session.user.id, id);
  if (!updated) {
    return NextResponse.json({ error: 'Notification not found.' }, { status: 404 });
  }
  const unreadCount = await getUnreadCount(session.user.id);
  return NextResponse.json({ ok: true, unreadCount });
}
