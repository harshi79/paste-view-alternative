import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { pastes } from '@/lib/db/schema';
import { verifyPassword } from '@/lib/auth';
import { incrementPasteViews } from '@/lib/pastes';

export const runtime = 'nodejs';

type Props = { params: Promise<{ id: string }> };

/** Verifies a paste password and returns the content to render client-side. */
export async function POST(req: Request, { params }: Props) {
  const { id } = await params;

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const db = await getDb();
  const [paste] = await db
    .select({
      content: pastes.content,
      language: pastes.language,
      passwordHash: pastes.passwordHash,
      expiresAt: pastes.expiresAt,
    })
    .from(pastes)
    .where(eq(pastes.id, id))
    .limit(1);

  if (!paste) {
    return NextResponse.json({ error: 'Paste not found.' }, { status: 404 });
  }
  if (paste.expiresAt && paste.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'This paste has expired.' }, { status: 410 });
  }
  if (!paste.passwordHash) {
    // Unprotected pastes are counted on the page itself; this endpoint
    // should only be called for protected ones, so bail without counting.
    return NextResponse.json({ content: paste.content, language: paste.language });
  }

  const ok = await verifyPassword(String(body.password ?? ''), paste.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: 'Wrong password.' }, { status: 401 });
  }

  // The visitor successfully unlocked the paste — count this as a view.
  await incrementPasteViews(id);

  return NextResponse.json({ content: paste.content, language: paste.language });
}
