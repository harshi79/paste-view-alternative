import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { pastes } from '@/lib/db/schema';
import { getSessionUser } from '@/lib/auth';
import { getClientIp } from '@/lib/ip';
import { getLikeState, likeActor, likePaste, unlikePaste } from '@/lib/likes';
import { notifyLike, notifySafely } from '@/lib/notifications';

export const runtime = 'nodejs';

type Props = { params: Promise<{ id: string }> };

/**
 * Like / unlike endpoint — TEMPORARY COMPATIBILITY surface.
 *
 * The like is no longer an independent system: this endpoint delegates
 * to the unified reaction model (src/lib/reactions.ts). Liking IS
 * selecting the ❤️ reaction; unliking IS removing it. No second record
 * is ever created — `likes` rows are only written for pre-unification
 * anonymous visitors, and nothing here touches them.
 *
 *   GET    → { count, liked } where count is the unified ❤️ count
 *            (❤️ reactions + retained anonymous likes) and `liked` is
 *            true when the actor's current reaction is ❤️ (or a
 *            returning anonymous visitor still holds a legacy row).
 *   POST   → selects ❤️ (signed-in users only — guests get 401, the
 *            same members-only rule as the reactions API).
 *   DELETE → removes ❤️ (only ❤️ — never a user's 🔥/sticker reaction).
 *
 * The existing LIKE notification behavior is preserved unchanged:
 * a notification is created for the paste owner when a signed-in
 * user's reaction BECOMES ❤️ (first like or a switch from another
 * reaction), never for self-likes, guest attempts, ownerless pastes or
 * failed requests, and duplicates stay collapsed by the dedupe key.
 */
export async function GET(_req: Request, { params }: Props) {
  const { id } = await params;
  const [session, ip] = await Promise.all([getSessionUser(), getClientIp()]);
  const db = await getDb();
  const [paste] = await db
    .select({ id: pastes.id, expiresAt: pastes.expiresAt })
    .from(pastes)
    .where(eq(pastes.id, id))
    .limit(1);
  if (!paste) return NextResponse.json({ error: 'Paste not found.' }, { status: 404 });
  if (paste.expiresAt && paste.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'This paste has expired.' }, { status: 410 });
  }
  const actor = likeActor(session?.user.id, ip);
  const { count, liked } = await getLikeState(id, actor);
  return NextResponse.json({ count, liked });
}

export async function POST(_req: Request, { params }: Props) {
  const { id } = await params;
  const [session, ip] = await Promise.all([getSessionUser(), getClientIp()]);
  if (!session) {
    // Anonymous liking ended with the unified reaction system — guests
    // are redirected to register by the UI (same as every reaction).
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const db = await getDb();
  // owner + title are read here (same indexed row read as before) so the
  // like notification can name the paste without a second query.
  const [paste] = await db
    .select({
      id: pastes.id,
      expiresAt: pastes.expiresAt,
      userId: pastes.userId,
      title: pastes.title,
    })
    .from(pastes)
    .where(eq(pastes.id, id))
    .limit(1);
  if (!paste) return NextResponse.json({ error: 'Paste not found.' }, { status: 404 });
  if (paste.expiresAt && paste.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'This paste has expired.' }, { status: 410 });
  }
  const actor = likeActor(session.user.id, ip);
  const result = await likePaste(id, actor);
  // Notify the paste owner — only when the user's reaction BECAME ❤️
  // with this call (`newlyLiked` is false when it already was ❤️).
  // Self-likes, guest attempts and ownerless pastes notify nobody. Runs
  // after the reaction transaction committed; a failure never changes
  // the like response.
  if (result.newlyLiked && session) {
    await notifySafely(() =>
      notifyLike(
        { id: session.user.id, username: session.user.username },
        { id: paste.id, userId: paste.userId, title: paste.title },
      ),
    );
  }
  return NextResponse.json({ ok: true, count: result.count, liked: result.liked });
}

export async function DELETE(_req: Request, { params }: Props) {
  const { id } = await params;
  const [session, ip] = await Promise.all([getSessionUser(), getClientIp()]);
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const db = await getDb();
  const [paste] = await db
    .select({ id: pastes.id, expiresAt: pastes.expiresAt })
    .from(pastes)
    .where(eq(pastes.id, id))
    .limit(1);
  if (!paste) return NextResponse.json({ error: 'Paste not found.' }, { status: 404 });
  const actor = likeActor(session.user.id, ip);
  const result = await unlikePaste(id, actor);
  return NextResponse.json({ ok: true, ...result });
}
