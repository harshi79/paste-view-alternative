import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { pastes } from '@/lib/db/schema';
import { getSessionUser, hashPassword } from '@/lib/auth';
import { generatePasteId, expiryFromId, EXPIRY_OPTIONS } from '@/lib/pastes';
import { isLanguage } from '@/lib/languages';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const title = String(body.title ?? 'Untitled').slice(0, 120) || 'Untitled';
  const content = String(body.content ?? '');
  const language = String(body.language ?? 'plaintext');
  const visibility = body.visibility === 'unlisted' ? 'unlisted' : 'public';
  const expiresIn = String(body.expiresIn ?? 'never');
  const password = body.password ? String(body.password) : '';
  const titleColor =
    typeof body.titleColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.titleColor)
      ? body.titleColor
      : null;

  if (!content.trim()) {
    return NextResponse.json({ error: 'Paste content is required.' }, { status: 400 });
  }
  if (content.length > 100_000) {
    return NextResponse.json({ error: 'Paste is too large (100k characters max).' }, { status: 413 });
  }
  if (!isLanguage(language)) {
    return NextResponse.json({ error: 'Unknown language.' }, { status: 400 });
  }
  if (password.length > 64) {
    return NextResponse.json({ error: 'Password too long (64 max).' }, { status: 400 });
  }
  if (!EXPIRY_OPTIONS.some((o) => o.id === expiresIn)) {
    return NextResponse.json({ error: 'Unknown expiration option.' }, { status: 400 });
  }

  const db = await getDb();
  const session = await getSessionUser();

  const id = await generatePasteId(db);
  await db.insert(pastes).values({
    id,
    userId: session?.user.id ?? null,
    title,
    titleColor,
    content,
    language,
    visibility,
    passwordHash: password ? await hashPassword(password) : null,
    expiresAt: expiryFromId(expiresIn),
  });

  return NextResponse.json({ ok: true, id });
}
