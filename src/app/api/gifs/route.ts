import { NextResponse } from 'next/server';
import { searchGifs, trendingGifs } from '@/lib/gifs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GIF search endpoint for the editor's Anime GIFs tab.
 *
 *   GET /api/gifs?q=cat   → GIFs matching "cat"
 *   GET /api/gifs         → a batch of trending GIFs
 *
 * Results are normalized to { url, preview, label }. Set `GIPHY_API_KEY`
 * in env for a real key; a public beta key is used by default.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();

  const gifs = q ? await searchGifs(q, 40) : await trendingGifs(24);

  return NextResponse.json(
    { gifs },
    {
      headers: {
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=300',
      },
    },
  );
}
