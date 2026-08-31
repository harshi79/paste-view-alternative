import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getUnreadCount } from '@/lib/notifications';

export const runtime = 'nodejs';

/**
 * Unread badge count for the signed-in user.
 * GET /api/notifications/unread-count → { count }
 * Guests get 401 (a guest has no notifications at all).
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const count = await getUnreadCount(session.user.id);
  return NextResponse.json({ count });
}
