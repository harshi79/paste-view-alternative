import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { pastes } from '@/lib/db/schema';
import { getSessionUser, hashPassword } from '@/lib/auth';
import { generatePasteId, expiryFromId, EXPIRY_OPTIONS } from '@/lib/pastes';
import { isLanguage } from '@/lib/languages';
import { isRichDoc, richDocLinksAreSafe, type RichDoc } from '@/lib/pasteFormat';
import {
  PASTE_MAX_CHARS,
  pasteTooLargeMessage,
  richDocLimitExceeded,
  richDocTotals,
} from '@/lib/pasteLimits';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const title = String(body.title ?? 'Untitled').slice(0, 120) || 'Untitled';
  // The unified editor always posts format 'rich' (plain text is simply an
  // unstyled RichDoc). 'plain' stays accepted so pre-unification clients and
  // any scripted creators keep working against the same endpoint unchanged.
  const format = body.format === 'rich' ? 'rich' : 'plain';
  const language = String(body.language ?? 'plaintext');
  const visibility = body.visibility === 'unlisted' ? 'unlisted' : 'public';
  const expiresIn = String(body.expiresIn ?? 'never');
  // A password is only accepted when the creator explicitly opts in. This
  // keeps the default public/unprotected and ignores accidental autofill.
  const passwordProtected = body.passwordProtected === true;
  const password = passwordProtected ? String(body.password ?? '') : '';
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
    // Explicit size policy, shared with the editor (src/lib/pasteLimits.ts)
    // and still enforced here as the final authority for every client.
    const overLimit = richDocLimitExceeded(doc);
    if (overLimit) {
      return NextResponse.json({ error: pasteTooLargeMessage(overLimit) }, { status: 413 });
    }
    const total = richDocTotals(doc).chars;
    if (doc.lines.length === 0 || total === 0) {
      return NextResponse.json({ error: 'Paste content is required.' }, { status: 400 });
    }
    // Link marks are rendered as `<a href>`, so their values are gated here
    // server-side: a hand-crafted RichDoc must never store an executable
    // (javascript:/data:/…) or otherwise unsafe link. The editor's own
    // links (http/https/mailto/tel) all pass unchanged.
    if (!richDocLinksAreSafe(doc)) {
      return NextResponse.json({ error: 'Invalid link in paste content.' }, { status: 400 });
    }
  } else {
    if (!content.trim()) {
      return NextResponse.json({ error: 'Paste content is required.' }, { status: 400 });
    }
    if (content.length > PASTE_MAX_CHARS) {
      return NextResponse.json({ error: pasteTooLargeMessage('chars') }, { status: 413 });
    }
  }

  if (!isLanguage(language)) {
    return NextResponse.json({ error: 'Unknown language.' }, { status: 400 });
  }
  if (passwordProtected && !password) {
    return NextResponse.json({ error: 'Enter a password to enable password protection.' }, { status: 400 });
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
