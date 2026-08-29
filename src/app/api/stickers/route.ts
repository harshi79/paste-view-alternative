import { NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { stickers } from '@/lib/db/schema';

/**
 * Public read endpoint — returns the entire sticker pack.
 * The pack only changes when an admin edits it, so we let the browser
 * and CDN cache it briefly; components also share a module-level cache
 * client-side (see @/lib/stickerPack).
 */
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
  return NextResponse.json(
    { stickers: rows },
    {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
      },
    },
  );
}
