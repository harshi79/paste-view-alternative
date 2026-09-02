import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { LATEST_PAGE_SIZE, listLatestPastes } from '@/lib/feed';
import { clampLimit } from '@/lib/notifications';

export const runtime = 'nodejs';

/**
 * Chronological discovery feed (newest first).
 *
 * GET /api/pastes/latest?limit=12&cursor=<nextCursor>
 *
 * Public. Viewer identity (bookmark / my-reaction) comes from the
 * session cookie only — a `userId` query param is ignored. `limit` is
 * clamped. Unlisted, password-protected, expired, and past-retention
 * pastes are never returned. Ordering is created_at DESC; there is no
 * popularity / trending score.
 */
export async function GET(req: Request) {
  const session = await getSessionUser();
  const url = new URL(req.url);
  const limit = clampLimit(url.searchParams.get('limit'), LATEST_PAGE_SIZE);
  const cursor = url.searchParams.get('cursor');

  const page = await listLatestPastes({
    limit,
    cursor,
    viewerId: session?.user.id ?? null,
  });

  return NextResponse.json({
    pastes: page.pastes,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  });
}
