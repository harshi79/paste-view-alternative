import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getGifById } from '@/lib/gifs';
import { NEKO_CATEGORIES } from '@/lib/neko';
import { isTrustedGiphyGifUrl, isTrustedNekoGifUrl, persistImportedSticker } from '@/lib/stickerImport';
import { isAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

type ImportBody =
  | { source?: 'giphy'; id?: string }
  | { source?: 'neko'; url?: string; category?: string };

/**
 * Promote a result from one of the app's server-backed GIF providers into
 * the persistent sticker pack. Arbitrary URLs and client-selected tokens
 * are deliberately not accepted.
 *
 * Requires an active admin session — anonymous and regular users are
 * rejected with 403.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  let body: ImportBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  let url: string;
  let label: string;
  let emoji: string | null = null;
  let fallbackStem: string;

  if (body.source === 'giphy') {
    const gif = await getGifById(String(body.id ?? ''));
    if (!gif || !isTrustedGiphyGifUrl(gif.url)) {
      return NextResponse.json({ error: 'GIF could not be verified.' }, { status: 400 });
    }
    url = gif.url;
    label = gif.label.slice(0, 40);
    emoji = '🎞️';
    fallbackStem = `giphy-${gif.id}`;
  } else if (body.source === 'neko') {
    const category = String(body.category ?? '').toLowerCase();
    const definition = NEKO_CATEGORIES.find(
      (item) => item.token === `:anime-${category}:`,
    );
    const candidateUrl = String(body.url ?? '');
    if (!definition || !isTrustedNekoGifUrl(candidateUrl, category)) {
      return NextResponse.json({ error: 'GIF could not be verified.' }, { status: 400 });
    }
    url = candidateUrl;
    label = definition.label.slice(0, 40);
    emoji = definition.emoji;
    fallbackStem = `anime-${category}`;
  } else {
    return NextResponse.json({ error: 'Unsupported GIF source.' }, { status: 400 });
  }

  const db = await getDb();
  try {
    const result = await persistImportedSticker(db, { url, label, emoji, fallbackStem });
    return NextResponse.json(result, { status: result.existing ? 200 : 201 });
  } catch {
    return NextResponse.json({ error: 'Could not allocate a unique sticker token.' }, { status: 409 });
  }
}
