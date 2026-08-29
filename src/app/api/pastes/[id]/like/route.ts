import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { pastes } from '@/lib/db/schema';
import { getSessionUser } from '@/lib/auth';
import { getClientIp } from '@/lib/ip';
import { getLikeState, likeActor, likePaste, unlikePaste } from '@/lib/likes';

export const runtime = 'nodejs';

type Props = { params: Promise<{ id: string }> };

/**
 * Like / unlike endpoint — guests and signed-in members can both
 * participate (one vote per user, or per anonymous IP hash).
 * GET returns the current state, POST likes, DELETE unlikes.
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
  const result = await likePaste(id, actor);
  return NextResponse.json({ ok: true, ...result });
}

export async function DELETE(_req: Request, { params }: Props) {
  const { id } = await params;
  const [session, ip] = await Promise.all([getSessionUser(), getClientIp()]);
  const db = await getDb();
  const [paste] = await db
    .select({ id: pastes.id, expiresAt: pastes.expiresAt })
    .from(pastes)
    .where(eq(pastes.id, id))
    .limit(1);
  if (!paste) return NextResponse.json({ error: 'Paste not found.' }, { status: 404 });
  const actor = likeActor(session?.user.id, ip);
  const result = await unlikePaste(id, actor);
  return NextResponse.json({ ok: true, ...result });
}
