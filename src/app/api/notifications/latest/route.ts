import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import {
  DEFAULT_LATEST_SIZE,
  clampLimit,
  getUnreadCount,
  listNotifications,
} from '@/lib/notifications';

export const runtime = 'nodejs';

/**
 * Latest notifications for the signed-in user — the small newest-first
 * slice a bell/dropdown consumes, plus the unread badge count in the
 * same round-trip.
 *
 * GET /api/notifications/latest?limit=8
 *
 * Same authorization as the history endpoint: guests get 401 and the
 * recipient always comes from the session.
 */
export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const limit = clampLimit(new URL(req.url).searchParams.get('limit'), DEFAULT_LATEST_SIZE);

  const [page, unreadCount] = await Promise.all([
    listNotifications(session.user.id, { limit }),
    getUnreadCount(session.user.id),
  ]);

  return NextResponse.json({
    notifications: page.notifications,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    unreadCount,
  });
}
