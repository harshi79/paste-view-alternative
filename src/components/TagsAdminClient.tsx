'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import TagBadge from '@/components/TagBadge';

type Tag = { id: string; label: string; color: string; effect: string };

const EFFECTS = [
  { id: '', label: 'None' },
  { id: 'shimmer', label: 'Shimmer' },
  { id: 'neon', label: 'Neon' },
  { id: 'rainbow', label: 'Rainbow' },
  { id: 'fire', label: 'Fire' },
  { id: 'gold', label: 'Gold' },
];

const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400';

export default function TagsAdminClient({ initial }: { initial: Tag[] }) {
  const router = useRouter();
  const [tags, setTags] = useState<Tag[]>(initial);
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('#a78bfa');
  const [effect, setEffect] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // inline edit state ("redo" a tag without deleting it)
  const [editId, setEditId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState('#a78bfa');
  const [editEffect, setEditEffect] = useState('');

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

  function startEdit(t: Tag) {
    setEditId(t.id);
    setEditLabel(t.label);
    setEditColor(t.color);
    setEditEffect(t.effect);
    setError('');
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/tags', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editId, label: editLabel, color: editColor, effect: editEffect }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Could not save changes.');
      return;
    }
    setTags((ts) =>
      ts
        .map((t) => (t.id === editId ? data.tag : t))
        .sort((a, b) => a.label.localeCompare(b.label)),
    );
    setEditId(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm('Delete this tag? It will be removed from every user.')) return;
    setBusy(true);
    const res = await fetch(`/api/admin/tags?id=${id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) {
      setTags((t) => t.filter((x) => x.id !== id));
      if (editId === id) setEditId(null);
      router.refresh();
    }
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        {tags.length === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-[color:var(--vb-line)] p-10 text-center text-zinc-500">
            No tags yet. Create your first one on the right.
          </p>
        ) : (
          tags.map((t) =>
            editId === t.id ? (
              <form
                key={t.id}
                onSubmit={saveEdit}
                className="card space-y-3 border-amber-400/30 p-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <TagBadge label={editLabel || 'Preview'} color={editColor} effect={editEffect} />
                  <span className="text-xs text-zinc-500">live preview</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
                  <input
                    className="input"
                    value={editLabel}
                    maxLength={40}
                    onChange={(e) => setEditLabel(e.target.value)}
                    placeholder="Label"
                  />
                  <input
                    type="color"
                    className="h-10 w-16 cursor-pointer rounded-lg border border-white/10 bg-transparent"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                  />
                  <select
                    className="input sm:w-36"
                    value={editEffect}
                    onChange={(e) => setEditEffect(e.target.value)}
                  >
                    {EFFECTS.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                </div>
                {error && <p className="text-sm text-red-400">{error}</p>}
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary px-4 py-2 text-xs" disabled={busy || !editLabel.trim()}>
                    {busy ? 'Saving…' : 'Save changes'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost px-4 py-2 text-xs"
                    onClick={() => setEditId(null)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div
                key={t.id}
                className="card flex items-center justify-between gap-3 p-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <TagBadge label={t.label} color={t.color} effect={t.effect} />
                  <span className="font-mono text-xs text-zinc-500">
                    {t.color} · {t.effect || 'no effect'}
                  </span>
                </div>
                <div className="flex flex-none gap-2">
                  <button
                    onClick={() => startEdit(t)}
                    disabled={busy}
                    className="rounded-md border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-300 hover:border-brand-400/60 hover:bg-brand-500/10 hover:text-brand-200 disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => remove(t.id)}
                    disabled={busy}
                    className="rounded-md border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-300 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ),
          )
        )}
      </div>

      <form onSubmit={create} className="card h-fit p-5">
        <h2 className="mb-4 font-bold text-white">New tag</h2>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Label</label>
            <input
              className="input"
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
            <select className="input" value={effect} onChange={(e) => setEffect(e.target.value)}>
              {EFFECTS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Preview
            </p>
            <TagBadge label={label || 'New tag'} color={color} effect={effect} />
          </div>
          {error && !editId && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy || !label}
            className="btn-primary w-full font-bold"
          >
            {busy ? 'Saving…' : 'Create tag'}
          </button>
        </div>
      </form>
    </div>
  );
}
