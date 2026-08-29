/**
 * Anime reaction GIFs from the Nekos.best API.
 *
 * Nekos.best (https://nekos.best) is a free, keyless, CORS-enabled API
 * that returns a random anime GIF per category. Each category is exposed
 * as a sticker shortcode (`:anime-hug:`, `:anime-pat:`, …) so it can be
 * inserted into a rich paste and rendered the same way as the DB pack.
 *
 * The GIF url is resolved at insert time and stored on the rich line
 * (`RichLine.stickerUrls`) so pastes render the exact GIF regardless of
 * the DB pack contents.
 *
 * The `emoji` below is the offline fallback — if the API can't be reached
 * the sticker degrades to its emoji instead of a broken image.
 */

export type NekoGif = {
  token: string; // shortcode, e.g. ":anime-hug:"
  url: string | null; // resolved GIF url (null when the API is unreachable)
  label: string;
  emoji: string; // offline fallback
};

export const NEKO_CATEGORIES: NekoGif[] = [
  { token: ':anime-hug:', url: null, label: 'Anime hug', emoji: '🤗' },
  { token: ':anime-kiss:', url: null, label: 'Anime kiss', emoji: '😘' },
  { token: ':anime-pat:', url: null, label: 'Anime pat', emoji: '🖐️' },
  { token: ':anime-blush:', url: null, label: 'Anime blush', emoji: '😊' },
  { token: ':anime-cry:', url: null, label: 'Anime cry', emoji: '😢' },
  { token: ':anime-wink:', url: null, label: 'Anime wink', emoji: '😉' },
  { token: ':anime-happy:', url: null, label: 'Anime happy', emoji: '😄' },
  { token: ':anime-dance:', url: null, label: 'Anime dance', emoji: '💃' },
  { token: ':anime-cuddle:', url: null, label: 'Anime cuddle', emoji: '🥰' },
  { token: ':anime-wave:', url: null, label: 'Anime wave', emoji: '👋' },
  { token: ':anime-baka:', url: null, label: 'Anime baka', emoji: '🤪' },
  { token: ':anime-bite:', url: null, label: 'Anime bite', emoji: '🦷' },
  { token: ':anime-bonk:', url: null, label: 'Anime bonk', emoji: '🔨' },
  { token: ':anime-bored:', url: null, label: 'Anime bored', emoji: '🥱' },
  { token: ':anime-bully:', url: null, label: 'Anime bully', emoji: '😈' },
  { token: ':anime-bye:', url: null, label: 'Anime bye', emoji: '👋' },
  { token: ':anime-chase:', url: null, label: 'Anime chase', emoji: '🏃' },
  { token: ':anime-clap:', url: null, label: 'Anime clap', emoji: '👏' },
  { token: ':anime-coffee:', url: null, label: 'Anime coffee', emoji: '☕' },
  { token: ':anime-confused:', url: null, label: 'Anime confused', emoji: '😕' },
  { token: ':anime-cool:', url: null, label: 'Anime cool', emoji: '😎' },
  { token: ':anime-cringe:', url: null, label: 'Anime cringe', emoji: '😬' },
  { token: ':anime-disgust:', url: null, label: 'Anime disgust', emoji: '🤢' },
  { token: ':anime-drink:', url: null, label: 'Anime drink', emoji: '🥤' },
  { token: ':anime-drop:', url: null, label: 'Anime drop', emoji: '💧' },
  { token: ':anime-eat:', url: null, label: 'Anime eat', emoji: '🍜' },
  { token: ':anime-facepalm:', url: null, label: 'Anime facepalm', emoji: '🤦' },
  { token: ':anime-feed:', url: null, label: 'Anime feed', emoji: '🍽️' },
  { token: ':anime-fight:', url: null, label: 'Anime fight', emoji: '🥊' },
  { token: ':anime-flirt:', url: null, label: 'Anime flirt', emoji: '😏' },
  { token: ':anime-food:', url: null, label: 'Anime food', emoji: '🍙' },
  { token: ':anime-goodnight:', url: null, label: 'Anime goodnight', emoji: '🌙' },
  { token: ':anime-greet:', url: null, label: 'Anime greet', emoji: '👋' },
  { token: ':anime-growl:', url: null, label: 'Anime growl', emoji: '😾' },
  { token: ':anime-headbang:', url: null, label: 'Anime headbang', emoji: '🤘' },
  { token: ':anime-hide:', url: null, label: 'Anime hide', emoji: '🙈' },
  { token: ':anime-highfive:', url: null, label: 'Anime highfive', emoji: '🖐️' },
  { token: ':anime-hold:', url: null, label: 'Anime hold', emoji: '🫂' },
  { token: ':anime-icecream:', url: null, label: 'Anime icecream', emoji: '🍦' },
  { token: ':anime-kick:', url: null, label: 'Anime kick', emoji: '🦵' },
  { token: ':anime-laugh:', url: null, label: 'Anime laugh', emoji: '😆' },
  { token: ':anime-lick:', url: null, label: 'Anime lick', emoji: '👅' },
  { token: ':anime-love:', url: null, label: 'Anime love', emoji: '❤️' },
  { token: ':anime-lonely:', url: null, label: 'Anime lonely', emoji: '🥺' },
  { token: ':anime-lurk:', url: null, label: 'Anime lurk', emoji: '👀' },
  { token: ':anime-nod:', url: null, label: 'Anime nod', emoji: '😌' },
  { token: ':anime-nom:', url: null, label: 'Anime nom', emoji: '😋' },
  { token: ':anime-nope:', url: null, label: 'Anime nope', emoji: '🚫' },
  { token: ':anime-nuzzle:', url: null, label: 'Anime nuzzle', emoji: '🥰' },
  { token: ':anime-ok:', url: null, label: 'Anime ok', emoji: '👌' },
  { token: ':anime-ouch:', url: null, label: 'Anime ouch', emoji: '😣' },
  { token: ':anime-poke:', url: null, label: 'Anime poke', emoji: '👉' },
  { token: ':anime-punch:', url: null, label: 'Anime punch', emoji: '👊' },
  { token: ':anime-push:', url: null, label: 'Anime push', emoji: '🙌' },
  { token: ':anime-question:', url: null, label: 'Anime question', emoji: '❓' },
  { token: ':anime-shrug:', url: null, label: 'Anime shrug', emoji: '🤷' },
  { token: ':anime-shy:', url: null, label: 'Anime shy', emoji: '😳' },
  { token: ':anime-sigh:', url: null, label: 'Anime sigh', emoji: '😮‍💨' },
  { token: ':anime-sleep:', url: null, label: 'Anime sleep', emoji: '😴' },
  { token: ':anime-slap:', url: null, label: 'Anime slap', emoji: '✋' },
  { token: ':anime-smile:', url: null, label: 'Anime smile', emoji: '😊' },
  { token: ':anime-smirk:', url: null, label: 'Anime smirk', emoji: '😏' },
  { token: ':anime-sniff:', url: null, label: 'Anime sniff', emoji: '👃' },
  { token: ':anime-stare:', url: null, label: 'Anime stare', emoji: '👁️' },
  { token: ':anime-surprised:', url: null, label: 'Anime surprised', emoji: '😲' },
  { token: ':anime-sweet:', url: null, label: 'Anime sweet', emoji: '🍬' },
  { token: ':anime-think:', url: null, label: 'Anime think', emoji: '🤔' },
  { token: ':anime-thumbsup:', url: null, label: 'Anime thumbsup', emoji: '👍' },
  { token: ':anime-tickle:', url: null, label: 'Anime tickle', emoji: '🪶' },
  { token: ':anime-tired:', url: null, label: 'Anime tired', emoji: '😫' },
  { token: ':anime-welcome:', url: null, label: 'Anime welcome', emoji: '🙌' },
  { token: ':anime-woah:', url: null, label: 'Anime woah', emoji: '🤯' },
  { token: ':anime-yawn:', url: null, label: 'Anime yawn', emoji: '🥱' },
  { token: ':anime-yeet:', url: null, label: 'Anime yeet', emoji: '🚀' },
  { token: ':anime-yes:', url: null, label: 'Anime yes', emoji: '✅' },
  { token: ':anime-poke2:', url: null, label: 'Anime poke 2', emoji: '☝️' },
];

const NEKO_API_BASE = 'https://nekos.best/api/v2/';

/** Map of category (without the :anime-…: wrapper) → its emoji fallback. */
export function nekoTokenSet(): Set<string> {
  return new Set(NEKO_CATEGORIES.map((g) => g.token));
}

/** Fetches one random GIF url for a category from Nekos.best. */
async function fetchCategoryUrl(category: string, timeoutMs = 8000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${NEKO_API_BASE}${category}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { url?: string }[] };
    return data.results?.[0]?.url ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** A tiny promise pool so we don't hammer the API with ~70 parallel calls. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Resolves a GIF url for every category by calling the Nekos.best API with
 * limited concurrency. Never throws — unreachable categories keep their
 * emoji fallback so the sticker tab always renders. An overall budget
 * prevents a slow/down API from hanging the request.
 */
export async function fetchNekoGifs(): Promise<NekoGif[]> {
  const overall = new Promise<null>((resolve) => setTimeout(() => resolve(null), 12000));
  const resolved = await Promise.race([
    mapPool(NEKO_CATEGORIES, 6, async (g) => {
      const cat = g.token.slice(':anime-'.length, -1);
      const url = await fetchCategoryUrl(cat);
      return { ...g, url };
    }),
    overall,
  ]);
  if (!resolved) {
    // Timed out — degrade gracefully to emoji-only entries.
    return NEKO_CATEGORIES.map((g) => ({ ...g, url: null }));
  }
  return resolved;
}
