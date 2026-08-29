import { NextResponse } from 'next/server';
import { fetchNekoGifs } from '@/lib/neko';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Returns anime reaction GIFs resolved from the Nekos.best API.
 *
 * The editor fetches this once when the "Anime" sticker tab is opened.
 * Because a given category's GIF can rotate, the browser is allowed to
 * cache briefly; `stale-while-revalidate` keeps it usable offline-ish.
 * Unreachable categories come back with `url: null` + an emoji fallback,
 * so the tab never shows a broken image.
 */
export async function GET() {
  const gifs = await fetchNekoGifs();
  return NextResponse.json(
    { gifs },
    {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
      },
    },
  );
}
