import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { pastes } from '@/lib/db/schema';
import { getSessionUser, hashPassword } from '@/lib/auth';
import { generatePasteId, expiryFromId, EXPIRY_OPTIONS } from '@/lib/pastes';
import { isLanguage } from '@/lib/languages';
import { isRichDoc, type RichDoc } from '@/lib/pasteFormat';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const title = String(body.title ?? 'Untitled').slice(0, 120) || 'Untitled';
  const format = body.format === 'rich' ? 'rich' : 'plain';
  const language = String(body.language ?? 'plaintext');
  const visibility = body.visibility === 'unlisted' ? 'unlisted' : 'public';
  const expiresIn = String(body.expiresIn ?? 'never');
  const password = body.password ? String(body.password) : '';
  const titleColor =
    typeof body.titleColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.titleColor)
      ? body.titleColor
      : null;

  let content = String(body.content ?? '');
  if (format === 'rich') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: 'Invalid rich content.' }, { status: 400 });
    }
    if (!isRichDoc(parsed)) {
      return NextResponse.json({ error: 'Invalid rich content.' }, { status: 400 });
    }
    const doc = parsed as RichDoc;
    // cap total chars
    const total = doc.lines.reduce((s, l) => s + l.text.length, 0);
    if (total > 100_000) {
      return NextResponse.json({ error: 'Paste is too large (100k characters max).' }, { status: 413 });
    }
    if (doc.lines.length === 0 || total === 0) {
      return NextResponse.json({ error: 'Paste content is required.' }, { status: 400 });
    }
  } else {
    if (!content.trim()) {
      return NextResponse.json({ error: 'Paste content is required.' }, { status: 400 });
    }
    if (content.length > 100_000) {
      return NextResponse.json({ error: 'Paste is too large (100k characters max).' }, { status: 413 });
    }
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
    format,
    content,
    language,
    visibility,
    passwordHash: password ? await hashPassword(password) : null,
    expiresAt: expiryFromId(expiresIn),
    createdAt: new Date(),
  });

  return NextResponse.json({ ok: true, id });
}
