/**
 * GIF search backed by the Giphy API.
 *
 * Giphy (developers.giphy.com) requires a free API key. We read it from
 * `GIPHY_API_KEY` and fall back to Giphy's published public beta key so
 * search works out of the box for small/development use. Set your own key
 * in env (`GIPHY_API_KEY`) for production rate limits.
 *
 * Runs server-side (this file is only imported by the /api/gifs route),
 * so the browser never touches the key.
 */

export type GifEntry = {
  /** Full-size GIF url used when the sticker is inserted into a paste. */
  url: string;
  /** Small preview (thumbnail) url shown in the search grid. */
  preview: string | null;
  /** Human-readable label (Giphy title). */
  label: string;
};

const DEFAULT_GIPHY_KEY = 'dc6zaTOxFJmzC'; // Giphy public beta key
const BASE = 'https://api.giphy.com/v1/gifs';

function apiKey(): string {
  return process.env.GIPHY_API_KEY || DEFAULT_GIPHY_KEY;
}

/**
 * Searches Giphy for up to `limit` GIFs matching `q`.
 * Never throws — a failed request returns an empty array so the UI shows a
 * "no results" state instead of crashing.
 */
export async function searchGifs(q: string, limit = 40): Promise<GifEntry[]> {
  const query = String(q ?? '').trim();
  if (!query) return [];
  try {
    const url =
      `${BASE}/search?api_key=${encodeURIComponent(apiKey())}` +
      `&q=${encodeURIComponent(query)}&limit=${limit}&rating=g&lang=en`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: { id?: string; title?: string; images?: Record<string, { url?: string } | undefined> }[];
    };
    return (data.data ?? [])
      .map((g) => ({
        url: g.images?.fixed_width?.url ?? g.images?.original?.url ?? '',
        preview: g.images?.preview_gif?.url ?? g.images?.fixed_width_small?.url ?? null,
        label: (g.title || '').replace(/^gif\s*/i, '').trim() || 'GIF',
      }))
      .filter((g) => g.url);
  } catch {
    return [];
  }
}

/** Fetches a small set of trending GIFs (used to fill the tab before any query). */
export async function trendingGifs(limit = 24): Promise<GifEntry[]> {
  try {
    const url = `${BASE}/trending?api_key=${encodeURIComponent(apiKey())}&limit=${limit}&rating=g`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: { title?: string; images?: Record<string, { url?: string } | undefined> }[];
    };
    return (data.data ?? [])
      .map((g) => ({
        url: g.images?.fixed_width?.url ?? '',
        preview: g.images?.preview_gif?.url ?? g.images?.fixed_width_small?.url ?? null,
        label: (g.title || '').replace(/^gif\s*/i, '').trim() || 'GIF',
      }))
      .filter((g) => g.url);
  } catch {
    return [];
  }
}
