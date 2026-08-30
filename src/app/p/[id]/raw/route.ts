import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { pastes } from '@/lib/db/schema';
import { purgeExpiredIfDue, incrementPasteViews } from '@/lib/pastes';
import { parsePasteContent, richDocToPlainText } from '@/lib/pasteFormat';

type Props = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Props) {
  const { id } = await params;
  const db = await getDb();
  // Throttled expiry purge — avoids a DELETE on every raw/download request.
  await purgeExpiredIfDue(db);

  const [paste] = await db.select().from(pastes).where(eq(pastes.id, id)).limit(1);

  if (!paste) {
    return new Response('paste not found', { status: 404 });
  }
  if (paste.expiresAt && paste.expiresAt.getTime() <= Date.now()) {
    return new Response('this paste has expired', { status: 410 });
  }
  if (paste.passwordHash) {
    return new Response('this paste is password protected', { status: 403 });
  }

  // Count the raw view too, so "Raw" and "Download" links contribute.
  await incrementPasteViews(paste.id);

  // Unified pastes store a RichDoc (even plain-text ones). Raw/Download
  // always serve the readable text rendering: legacy 'plain' rows pass
  // through byte-for-byte, rich docs are flattened line by line. Invalid
  // rich JSON falls back to the stored string (parsePasteContent), never
  // to an error.
  const parsed = parsePasteContent(paste.format, paste.content);
  const body = typeof parsed === 'string' ? parsed : richDocToPlainText(parsed);

  const url = new URL(req.url);
  const headers: Record<string, string> = {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  };
  if (url.searchParams.get('download')) {
    headers['Content-Disposition'] = `attachment; filename="${paste.id}.txt"`;
  }
  return new Response(body, { headers });
}
