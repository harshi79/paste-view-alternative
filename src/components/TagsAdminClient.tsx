'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Tag = { id: string; label: string; color: string; effect: string };

const EFFECTS = [
  { id: '', label: 'None' },
  { id: 'shimmer', label: 'Shimmer' },
  { id: 'neon', label: 'Neon' },
  { id: 'rainbow', label: 'Rainbow' },
  { id: 'fire', label: 'Fire' },
  { id: 'gold', label: 'Gold' },
];

const EFFECT_BG: Record<string, string> = {
  '': 'bg-white/5',
  shimmer: 'bg-gradient-to-r from-brand-500 to-cyan-300 text-white',
  neon: 'bg-cyan-500/30 text-cyan-100',
  rainbow:
    'bg-gradient-to-r from-rose-400 via-amber-300 via-emerald-300 via-cyan-300 to-violet-400 text-white',
  fire: 'bg-gradient-to-r from-amber-500 to-rose-600 text-white',
  gold: 'bg-gradient-to-r from-amber-700 to-yellow-200 text-amber-950',
};

export default function TagsAdminClient({ initial }: { initial: Tag[] }) {
  const router = useRouter();
  const [tags, setTags] = useState<Tag[]>(initial);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('#a78bfa');
  const [effect, setEffect] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, color, effect }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Could not create tag.');
      return;
    }
    setTags((t) => [...t, data.tag].sort((a, b) => a.label.localeCompare(b.label)));
    setLabel('');
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm('Delete this tag? It will be removed from every user.')) return;
    setBusy(true);
    const res = await fetch(`/api/admin/tags?id=${id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) {
      setTags((t) => t.filter((x) => x.id !== id));
      router.refresh();
    }
  }

  const input =
    'w-full rounded-xl border border-white/10 bg-night-800 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-amber-400/60 focus:ring-2 focus:ring-amber-500/20';
  const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400';

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        {tags.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-zinc-500">
            No tags yet. Create your first one on the right.
          </p>
        ) : (
          tags.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-night-800/60 p-4"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${EFFECT_BG[t.effect] ?? 'bg-white/10 text-zinc-200'}`}
                  style={
                    t.effect === ''
                      ? { background: `${t.color}22`, color: t.color, border: `1px solid ${t.color}55` }
                      : undefined
                  }
                >
                  {t.label}
                </span>
                <span className="font-mono text-xs text-zinc-500">
                  {t.color} · {t.effect || 'no effect'}
                </span>
              </div>
              <button
                onClick={() => remove(t.id)}
                disabled={busy}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>

      <form onSubmit={create} className="rounded-2xl border border-white/10 bg-night-800/60 p-5">
        <h2 className="mb-4 font-bold text-white">New tag</h2>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Label</label>
            <input
              className={input}
              value={label}
              maxLength={40}
              placeholder="e.g. Founder"
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-10 w-16 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <span className="font-mono text-xs text-zinc-500">{color}</span>
            </div>
          </div>
          <div>
            <label className={labelCls}>Effect</label>
            <select className={input} value={effect} onChange={(e) => setEffect(e.target.value)}>
              {EFFECTS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy || !label}
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-500/30 hover:brightness-110 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Create tag'}
          </button>
        </div>
      </form>
    </div>
  );
}
