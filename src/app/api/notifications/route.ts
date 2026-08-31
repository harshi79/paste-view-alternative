import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { clampLimit, getUnreadCount, listNotifications } from '@/lib/notifications';

export const runtime = 'nodejs';

/**
 * Notification history for the signed-in user (newest first).
 *
 * GET /api/notifications?limit=20&cursor=<nextCursor>&filter=unread
 *
 * - Guests get 401; there is no way to read someone else's list: the
 *   recipient is taken from the session, never from the request.
 * - `limit` is clamped server-side (max 50) so an unbounded read is
 *   impossible; `cursor` is the keyset cursor returned as `nextCursor`
 *   by the previous page (load-more).
 */
export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get('limit'));
  const cursor = url.searchParams.get('cursor');
  const unreadOnly = url.searchParams.get('filter') === 'unread';

  const [page, unreadCount] = await Promise.all([
    listNotifications(session.user.id, { limit, cursor, unreadOnly }),
    getUnreadCount(session.user.id),
  ]);

  return NextResponse.json({
    notifications: page.notifications,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    unreadCount,
  });
}
