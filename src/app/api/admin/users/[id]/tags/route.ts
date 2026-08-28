import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { userTags } from '@/lib/db/schema';
import { isAdmin } from '@/lib/auth';

type Props = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Props) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  const { id: userId } = await params;
  const db = await getDb();
  const rows = await db
    .select({ tagId: userTags.tagId })
    .from(userTags)
    .where(eq(userTags.userId, userId));
  return NextResponse.json({ tagIds: rows.map((r) => r.tagId) });
}
