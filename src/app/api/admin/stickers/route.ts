import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { stickers } from '@/lib/db/schema';
import { isAdmin } from '@/lib/auth';

async function guard() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  return null;
}

export async function POST(req: Request) {
  const g = await guard();
  if (g) return g;
  let body: { token?: string; url?: string | null; emoji?: string | null; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const token = String(body.token ?? '').trim();
  if (!/^:[a-z0-9_+-]+:$/i.test(token)) {
    return NextResponse.json({ error: 'Token must look like :wave:' }, { status: 400 });
  }
  const url = body.url ? String(body.url).trim() : null;
  const emoji = body.emoji ? String(body.emoji).trim() : null;
  if (!url && !emoji) {
    return NextResponse.json({ error: 'Provide a URL or an emoji.' }, { status: 400 });
  }
  if (url) {
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        return NextResponse.json({ error: 'URL must be http(s).' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid URL.' }, { status: 400 });
    }
  }
  const label = String(body.label ?? '').trim().slice(0, 40);
  const db = await getDb();
  const [existing] = await db.select().from(stickers).where(eq(stickers.token, token)).limit(1);
  if (existing) {
    return NextResponse.json({ error: 'A sticker with that token already exists.' }, { status: 409 });
  }
  const [row] = await db
    .insert(stickers)
    .values({ id: randomUUID(), token, url, emoji, label, createdAt: new Date() })
    .returning();
  return NextResponse.json({ sticker: row });
}

export async function DELETE(req: Request) {
  const g = await guard();
  if (g) return g;
  const url = new URL(req.url);
  const id = url.searchParams.get('id') ?? '';
  if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 });
  const db = await getDb();
  await db.delete(stickers).where(eq(stickers.id, id));
  return NextResponse.json({ ok: true });
}
