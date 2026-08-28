import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { userTags, tags } from '@/lib/db/schema';
import { isAdmin } from '@/lib/auth';

type Props = { params: Promise<{ id: string }> };

/** List the tags currently assigned to a user. */
export async function GET(_req: Request, { params }: Props) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  const { id: userId } = await params;
  const db = await getDb();
  const rows = await db
    .select({ tagId: userTags.tagId })
    .from(userTags)
    .where(eq(userTags.userId, userId));
  return NextResponse.json({ tagIds: rows.map((r) => r.tagId) });
}

/** Assign or remove a tag on a user. Body: { tagId, assign }. */
export async function POST(req: Request, { params }: Props) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  const { id: userId } = await params;

  let body: { tagId?: string; assign?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const tagId = String(body.tagId ?? '').trim();
  const want = body.assign !== false;
  if (!tagId) {
    return NextResponse.json({ error: 'Missing tagId.' }, { status: 400 });
  }
  if (!userId) {
    return NextResponse.json({ error: 'Missing user id.' }, { status: 400 });
  }

  const db = await getDb();
  const [tag] = await db.select().from(tags).where(eq(tags.id, tagId)).limit(1);
  if (!tag) {
    return NextResponse.json({ error: 'Tag not found.' }, { status: 404 });
  }

  if (want) {
    await db
      .insert(userTags)
      .values({ userId, tagId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(userTags)
      .where(and(eq(userTags.userId, userId), eq(userTags.tagId, tagId)));
  }

  return NextResponse.json({ ok: true });
}
