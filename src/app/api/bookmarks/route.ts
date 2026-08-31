import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { listBookmarkedPastes } from '@/lib/bookmarks';
import { clampLimit } from '@/lib/notifications';

export const runtime = 'nodejs';

/**
 * Saved posts for the signed-in user (most recently saved first).
 *
 * GET /api/bookmarks?limit=20&cursor=<nextCursor>
 *
 * - Guests get 401; there is no way to read someone else's saved posts:
 *   the owner is taken from the session, never from the request.
 * - `limit` is clamped server-side (max 50) so an unbounded read is
 *   impossible; `cursor` is the keyset cursor returned as `nextCursor`
 *   by the previous page (load-more). Expired pastes are excluded.
 */
export async function GET(req: Request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get('limit'));
  const cursor = url.searchParams.get('cursor');

  const page = await listBookmarkedPastes(session.user.id, { limit, cursor });

  return NextResponse.json({
    bookmarks: page.bookmarks,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  });
}
