'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Sticker = {
  id: string;
  token: string;
  url: string | null;
  emoji: string | null;
  label: string;
};

type AnimeGif = {
  url: string;
  category: string;
  anime_name?: string;
};

// Curated subset of the keyless NekosBest reaction-GIF categories
// (https://nekos.best — free, CORS-enabled, no API key).
const ANIME_CATEGORIES = [
  'hug', 'kiss', 'pat', 'cry', 'blush', 'wink', 'happy', 'dance',
  'cuddle', 'wave', 'smug', 'thumbsup',
] as const;

const NEKOS = 'https://nekos.best/api/v2';

export default function StickersAdminClient({ initial }: { initial: Sticker[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<'pack' | 'anime'>('pack');
  const [list, setList] = useState<Sticker[]>(initial);
  const [token, setToken] = useState('');
  const [url, setUrl] = useState('');
  const [emoji, setEmoji] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // anime GIF browser state
  const [category, setCategory] = useState<string>('hug');
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<AnimeGif[]>([]);
  const [gifBusy, setGifBusy] = useState(false);
  const [gifError, setGifError] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tokenSet = useMemo(() => new Set(list.map((s) => s.token.toLowerCase())), [list]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!/^:[a-z0-9_+-]+:$/i.test(token)) {
      setError('Token must look like :wave: (letters/numbers/+/-/_ between colons).');
      return;
    }
    if (!url && !emoji) {
      setError('Provide either an image URL or an emoji fallback.');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/admin/stickers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, url: url || null, emoji: emoji || null, label }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Could not add sticker.');
      return;
    }
    setList((s) => [...s, data.sticker].sort((a, b) => a.token.localeCompare(b.token)));
    setToken('');
    setUrl('');
    setEmoji('');
    setLabel('');
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm('Delete this sticker?')) return;
    setBusy(true);
    const res = await fetch(`/api/admin/stickers?id=${id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) {
      setList((s) => s.filter((x) => x.id !== id));
      router.refresh();
    }
  }

  /** Load random GIFs for a category (or the default pack of 12). */
  async function loadCategory(cat: string) {
    setCategory(cat);
    setQuery('');
    setGifBusy(true);
    setGifError('');
    try {
      const res = await fetch(`${NEKOS}/${cat}?amount=12`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const results: AnimeGif[] = (data.results ?? []).map((r: Record<string, unknown>) => ({
        url: String(r.url),
        category: cat,
        anime_name: typeof r.anime_name === 'string' ? r.anime_name : undefined,
      }));
      setGifs(results);
    } catch {
      setGifs([]);
      setGifError('Could not reach the free GIF service. Try again in a moment.');
    } finally {
      setGifBusy(false);
    }
  }

  /** Debounced text search across all categories (GIFs only). */
  function search(value: string) {
    setQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const q = value.trim();
      if (q.length < 2) {
        loadCategory(category);
        return;
      }
      setGifBusy(true);
      setGifError('');
      try {
        const res = await fetch(`${NEKOS}/search?query=${encodeURIComponent(q)}&type=2&amount=12`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const results: AnimeGif[] = (data.results ?? []).map((r: Record<string, unknown>) => ({
          url: String(r.url),
          category: (String(r.url).split('/')[6] ?? 'anime'),
          anime_name: typeof r.anime_name === 'string' ? r.anime_name : undefined,
        }));
        setCategory('');
        setGifs(results);
      } catch {
        setGifs([]);
        setGifError('Could not reach the free GIF service. Try again in a moment.');
      } finally {
        setGifBusy(false);
      }
    }, 450);
  }

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  /** Save a browsed GIF into the sticker pack. */
  async function addAnime(gif: AnimeGif) {
    const token = `:${gif.category}:`;
    setAdding(gif.url);
    setGifError('');
    const label = gif.anime_name ? `Anime ${gif.category} — ${gif.anime_name}` : `Anime ${gif.category}`;
    const res = await fetch('/api/admin/stickers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, url: gif.url, label: label.slice(0, 40) }),
    });
    const data = await res.json();
    setAdding(null);
    if (!res.ok) {
      setGifError(data.error || 'Could not add sticker.');
      return;
    }
    setList((s) => [...s, data.sticker].sort((a, b) => a.token.localeCompare(b.token)));
    router.refresh();
  }

  const input =
    'w-full rounded-xl border border-white/10 bg-night-800 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-amber-400/60 focus:ring-2 focus:ring-amber-500/20';
  const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400';
  const tabBtn = (active: boolean) =>
    `rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
      active ? 'bg-amber-500/15 text-amber-200' : 'text-zinc-400 hover:text-white'
    }`;

  return (
    <div className="mt-6">
      <div className="mb-5 inline-flex items-center gap-1 rounded-xl border border-white/10 bg-night-800/60 p-1">
        <button type="button" className={tabBtn(tab === 'pack')} onClick={() => setTab('pack')}>
          Pack ({list.length})
        </button>
        <button type="button" className={tabBtn(tab === 'anime')} onClick={() => setTab('anime')}>
          Browse anime GIFs
        </button>
      </div>

      {tab === 'anime' ? (
        <div className="rounded-2xl border border-white/10 bg-night-800/60 p-5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-white">Free anime GIF browser</h2>
            <p className="text-xs text-zinc-500">
              No API key — served by{' '}
              <a
                href="https://nekos.best"
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-amber-300/80 underline underline-offset-2 hover:text-amber-200"
              >
                nekos.best
              </a>
              (free, CORS-enabled). Pick one and it lands in the pack with a token like <code className="font-mono">:hug:</code>.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {ANIME_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => loadCategory(c)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  category === c
                    ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                    : 'border-white/10 bg-white/5 text-zinc-300 hover:border-white/25'
                }`}
              >
                :{c}:
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                const c = ANIME_CATEGORIES[Math.floor(Math.random() * ANIME_CATEGORIES.length)];
                loadCategory(c);
              }}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-zinc-300 transition-colors hover:border-brand-400/40 hover:text-white"
            >
              🎲 Random
            </button>
          </div>

          <input
            className={`${input} mt-4 max-w-md`}
            placeholder="Search all anime GIFs — e.g. “laugh”, “stare”, “baka”…"
            value={query}
            onChange={(e) => search(e.target.value)}
          />

          {gifError && <p className="mt-3 text-sm text-red-400">{gifError}</p>}
          {gifBusy && <p className="mt-4 text-sm text-zinc-500">Loading GIFs…</p>}

          {!gifBusy && gifs.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {gifs.map((g) => {
                const token = `:${g.category}:`;
                const inPack = tokenSet.has(token);
                return (
                  <div
                    key={g.url}
                    className="overflow-hidden rounded-xl border border-white/10 bg-night-900/60"
                  >
                    <div className="grid aspect-video place-items-center bg-night-950/60 p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={g.url}
                        alt={g.anime_name || `Anime ${g.category} GIF`}
                        loading="lazy"
                        decoding="async"
                        className="max-h-28 object-contain"
                      />
                    </div>
                    <div className="p-2.5">
                      <p className="truncate text-xs text-zinc-400" title={g.anime_name}>
                        {g.anime_name || g.category}
                      </p>
                      <button
                        type="button"
                        disabled={inPack || adding === g.url}
                        onClick={() => addAnime(g)}
                        className="mt-2 w-full rounded-lg border border-amber-400/30 bg-amber-500/10 py-1.5 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                      >
                        {inPack ? '✓ In pack' : adding === g.url ? 'Adding…' : `+ Add :${g.category}:`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!gifBusy && gifs.length === 0 && !gifError && (
            <p className="mt-4 text-sm text-zinc-500">Pick a category or search to load GIFs.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {list.length === 0 ? (
              <p className="col-span-full rounded-2xl border border-dashed border-white/10 p-10 text-center text-zinc-500">
                No stickers yet.
              </p>
            ) : (
              list.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-night-800/60 p-3"
                >
                  <div className="grid h-14 w-14 place-items-center rounded-lg bg-white/5">
                    {s.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.url} alt={s.label} loading="lazy" decoding="async" className="h-10 w-10 object-contain" />
                    ) : (
                      <span className="text-2xl">{s.emoji ?? '?'}</span>
                    )}
                  </div>
                  <p className="font-mono text-xs text-zinc-300">{s.token}</p>
                  <p className="text-[11px] text-zinc-500">{s.label}</p>
                  <button
                    onClick={() => remove(s.id)}
                    disabled={busy}
                    className="mt-1 text-[11px] text-zinc-500 hover:text-red-300"
                  >
                    delete
                  </button>
                </div>
              ))
            )}
          </div>

          <form onSubmit={add} className="h-fit rounded-2xl border border-white/10 bg-night-800/60 p-5">
            <h2 className="mb-4 font-bold text-white">New sticker</h2>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Token (what users type)</label>
                <input
                  className={input}
                  placeholder=":wave:"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Image URL (optional)</label>
                <input
                  className={input}
                  placeholder="https://…/wave.gif"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Fallback emoji (optional)</label>
                <input
                  className={input}
                  placeholder="👋"
                  value={emoji}
                  onChange={(e) => setEmoji(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>Label</label>
                <input
                  className={input}
                  placeholder="Waving hand"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-500/30 hover:brightness-110 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Add sticker'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
