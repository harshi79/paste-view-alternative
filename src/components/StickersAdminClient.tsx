'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Sticker = {
  id: string;
  token: string;
  url: string | null;
  emoji: string | null;
  label: string;
};

export default function StickersAdminClient({ initial }: { initial: Sticker[] }) {
  const router = useRouter();
  const [list, setList] = useState<Sticker[]>(initial);
  const [token, setToken] = useState('');
  const [url, setUrl] = useState('');
  const [emoji, setEmoji] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  const input =
    'w-full rounded-xl border border-white/10 bg-night-800 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-amber-400/60 focus:ring-2 focus:ring-amber-500/20';
  const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400';

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
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
                  <img src={s.url} alt={s.label} className="h-10 w-10 object-contain" />
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

      <form onSubmit={add} className="rounded-2xl border border-white/10 bg-night-800/60 p-5">
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
  );
}
