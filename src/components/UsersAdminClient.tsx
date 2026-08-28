'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type UserRow = { id: string; username: string; createdAt: Date };
type Tag = { id: string; label: string; color: string; effect: string };

export default function UsersAdminClient({
  initial,
  initialQuery,
}: {
  initial: UserRow[];
  initialQuery: string;
}) {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>(initial);
  const [q, setQ] = useState(initialQuery);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/admin/tags')
      .then((r) => (r.ok ? r.json() : { tags: [] }))
      .then((d) => setTags(d.tags));
  }, []);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const url = new URL('/admin/users', window.location.origin);
    if (q.trim()) url.searchParams.set('q', q.trim());
    router.push(url.toString());
    router.refresh();
  }

  async function openUser(id: string) {
    setActiveId(id);
    setAssigned(new Set());
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${id}/tags`);
      if (res.ok) {
        const data = await res.json();
        setAssigned(new Set(data.tagIds ?? []));
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggle(tagId: string, want: boolean) {
    if (!activeId) return;
    setBusy(true);
    const res = await fetch(`/api/admin/users/${activeId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagId, assign: want }),
    });
    setBusy(false);
    if (res.ok) {
      const next = new Set(assigned);
      if (want) next.add(tagId);
      else next.delete(tagId);
      setAssigned(next);
    }
  }

  const input =
    'w-full rounded-xl border border-white/10 bg-night-800 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-amber-400/60 focus:ring-2 focus:ring-amber-500/20';

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <form onSubmit={search} className="mb-3 flex gap-2">
          <input
            className={input}
            placeholder="Search by username…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            type="submit"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/10"
          >
            Search
          </button>
        </form>

        {users.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-zinc-500">
            No users found.
          </p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => openUser(u.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl border bg-night-800/60 p-4 text-left transition-colors ${
                  activeId === u.id
                    ? 'border-amber-400/60'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                <span className="font-mono text-sm text-zinc-200">@{u.username}</span>
                <span className="text-xs text-zinc-500">
                  {new Date(u.createdAt).toLocaleDateString()}
                </span>
                <Link
                  href={`/u/${u.username}`}
                  className="text-xs text-brand-300 hover:text-brand-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  view →
                </Link>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-night-800/60 p-5">
        <h2 className="mb-3 font-bold text-white">
          {activeId ? 'Tags for selected user' : 'Select a user'}
        </h2>
        {!activeId ? (
          <p className="text-sm text-zinc-500">Pick a user on the left to assign or remove tags.</p>
        ) : (
          <div className="space-y-2">
            {tags.length === 0 ? (
              <p className="text-sm text-zinc-500">No tags exist. Create some in the Tags page.</p>
            ) : (
              tags.map((t) => {
                const on = assigned.has(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => toggle(t.id, !on)}
                    disabled={busy}
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm transition disabled:opacity-50 ${
                      on ? 'border-amber-400/50 bg-amber-500/10' : 'border-white/10 bg-white/5 hover:border-white/25'
                    }`}
                  >
                    <span
                      className="rounded-full px-3 py-0.5 text-xs font-bold"
                      style={{
                        background: `${t.color}22`,
                        color: t.color,
                        border: `1px solid ${t.color}55`,
                      }}
                    >
                      {t.label}
                    </span>
                    <span className="text-xs text-zinc-400">{on ? 'Remove' : 'Assign'}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
