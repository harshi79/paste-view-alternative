import { NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { stickers } from '@/lib/db/schema';

/** Public read endpoint — returns the entire sticker pack. */
export async function GET() {
  const db = await getDb();
  const rows = await db
    .select({
      token: stickers.token,
      url: stickers.url,
      emoji: stickers.emoji,
      label: stickers.label,
    })
    .from(stickers)
    .orderBy(asc(stickers.token));
  return NextResponse.json({ stickers: rows });
}
