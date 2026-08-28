import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { pastes } from '@/lib/db/schema';
import { getSessionUser } from '@/lib/auth';

export const runtime = 'nodejs';

type Props = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Props) {
  const { id } = await params;
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const db = await getDb();
  const deleted = await db
    .delete(pastes)
    .where(and(eq(pastes.id, id), eq(pastes.userId, session.user.id)))
    .returning({ id: pastes.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'Paste not found (or not yours).' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
