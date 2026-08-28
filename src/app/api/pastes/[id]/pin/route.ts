import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { pastes } from '@/lib/db/schema';
import { getSessionUser } from '@/lib/auth';

export const runtime = 'nodejs';

type Props = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Props) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const db = await getDb();
  const [paste] = await db
    .select({ pinned: pastes.pinned })
    .from(pastes)
    .where(and(eq(pastes.id, id), eq(pastes.userId, session.user.id)))
    .limit(1);

  if (!paste) {
    return NextResponse.json({ error: 'Paste not found (or not yours).' }, { status: 404 });
  }

  await db
    .update(pastes)
    .set({ pinned: !paste.pinned })
    .where(and(eq(pastes.id, id), eq(pastes.userId, session.user.id)));

  return NextResponse.json({ ok: true, pinned: !paste.pinned });
}
