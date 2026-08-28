import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { pastes } from '@/lib/db/schema';
import { purgeExpired } from '@/lib/pastes';

type Props = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Props) {
  const { id } = await params;
  const db = await getDb();
  await purgeExpired(db);

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

  const url = new URL(req.url);
  const headers: Record<string, string> = {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  };
  if (url.searchParams.get('download')) {
    headers['Content-Disposition'] = `attachment; filename="${paste.id}.txt"`;
  }
  return new Response(paste.content, { headers });
}
