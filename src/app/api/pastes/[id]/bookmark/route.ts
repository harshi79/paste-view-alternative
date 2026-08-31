import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { pastes } from '@/lib/db/schema';
import { getSessionUser } from '@/lib/auth';
import { bookmarkPaste, isBookmarked, unbookmarkPaste } from '@/lib/bookmarks';

export const runtime = 'nodejs';

type Props = { params: Promise<{ id: string }> };

async function findPaste(id: string) {
  const db = await getDb();
  const [paste] = await db
    .select({ id: pastes.id, expiresAt: pastes.expiresAt })
    .from(pastes)
    .where(eq(pastes.id, id))
    .limit(1);
  return paste ?? null;
}

/**
 * Bookmark endpoint — signed-in members only (guests get 401; unlike
 * likes there is no anonymous actor). Every mutation is keyed on the
 * session's own user id, so one user can never read or change another
 * user's bookmarks.
 *
 * GET returns the caller's bookmark state, POST saves the paste,
 * DELETE permanently removes the save. POST and DELETE are idempotent:
 * a duplicate POST inserts nothing (created: false) and a repeated
 * DELETE removes nothing (removed: false) — both still return the
 * current state so the client can reconcile.
 */
export async function GET(_req: Request, { params }: Props) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const paste = await findPaste(id);
  if (!paste) return NextResponse.json({ error: 'Paste not found.' }, { status: 404 });
  if (paste.expiresAt && paste.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'This paste has expired.' }, { status: 410 });
  }
  const bookmarked = await isBookmarked(session.user.id, paste.id);
  return NextResponse.json({ bookmarked });
}

export async function POST(_req: Request, { params }: Props) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const paste = await findPaste(id);
  if (!paste) return NextResponse.json({ error: 'Paste not found.' }, { status: 404 });
  if (paste.expiresAt && paste.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'This paste has expired.' }, { status: 410 });
  }
  const result = await bookmarkPaste(session.user.id, paste.id);
  return NextResponse.json({ ok: true, ...result });
}

export async function DELETE(_req: Request, { params }: Props) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const paste = await findPaste(id);
  if (!paste) return NextResponse.json({ error: 'Paste not found.' }, { status: 404 });
  const result = await unbookmarkPaste(session.user.id, paste.id);
  return NextResponse.json({ ok: true, ...result });
}
