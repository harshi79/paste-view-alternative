'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import TagBadge from '@/components/TagBadge';

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
  const [loadingUser, setLoadingUser] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/tags')
      .then((r) => (r.ok ? r.json() : { tags: [] }))
      .then((d) => setTags(d.tags ?? []));
  }, []);

  // Keep the list in sync when the server re-renders with new props
  // (e.g. after a search navigation).
  useEffect(() => {
    setUsers(initial);
  }, [initial]);

  const activeUser = useMemo(
    () => users.find((u) => u.id === activeId) ?? null,
    [users, activeId],
  );

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
    setError('');
    setLoadingUser(true);
    try {
      const res = await fetch(`/api/admin/users/${id}/tags`);
      if (res.ok) {
        const data = await res.json();
        setAssigned(new Set(data.tagIds ?? []));
      } else {
        setError('Could not load this user’s tags.');
      }
    } finally {
      setLoadingUser(false);
    }
  }

  async function toggle(tagId: string, want: boolean) {
    if (!activeId) return;
    setBusyId(tagId);
    setError('');
    // Optimistic update, rolled back if the request fails.
    setAssigned((prev) => {
      const next = new Set(prev);
      if (want) next.add(tagId);
      else next.delete(tagId);
      return next;
    });
    const res = await fetch(`/api/admin/users/${activeId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagId, assign: want }),
    });
    setBusyId(null);
    if (res.ok) return;
    setAssigned((prev) => {
      const next = new Set(prev);
      if (want) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
    setError('Change failed — please try again.');
  }

  const activeTags = tags.filter((t) => assigned.has(t.id));
  const availableTags = tags.filter((t) => !assigned.has(t.id));

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <form onSubmit={search} className="mb-3 flex gap-2">
          <input
            className="input"
            placeholder="Search by username…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="submit" className="btn-ghost">
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
              <div
                key={u.id}
                className={`flex w-full items-center gap-3 rounded-2xl border bg-night-800/60 p-4 text-left transition-colors ${
                  activeId === u.id
                    ? 'border-amber-400/60'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                {/* The row opens the user's tag manager via a real <button>;
                    the "view →" profile link is a sibling <a> (a <Link>), so no
                    interactive element is nested inside another. */}
                <button
                  onClick={() => openUser(u.id)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                >
                  <span className="font-mono text-sm text-zinc-200">@{u.username}</span>
                  <span className="text-xs text-zinc-500">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </span>
                </button>
                <Link
                  href={`/u/${u.username}`}
                  className="shrink-0 text-xs text-brand-300 hover:text-brand-200"
                >
                  view →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card h-fit p-5 lg:sticky lg:top-20">
        {!activeId ? (
          <>
            <h2 className="font-bold text-white">Tag manager</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Pick a user on the left to review, give, or remove their tags.
            </p>
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="font-bold text-white">
                <span className="font-mono">@{activeUser?.username ?? '…'}</span>
              </h2>
              {activeUser && (
                <Link
                  href={`/u/${activeUser.username}`}
                  className="text-xs text-brand-300 hover:text-brand-200"
                >
                  open profile →
                </Link>
              )}
            </div>

            {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

            {loadingUser ? (
              <p className="text-sm text-zinc-500">Loading tags…</p>
            ) : tags.length === 0 ? (
              <p className="text-sm text-zinc-500">No tags exist. Create some in the Tags page.</p>
            ) : (
              <>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Current tags
                </p>
                {activeTags.length === 0 ? (
                  <p className="text-xs text-zinc-600">This user has no tags yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {activeTags.map((t) => (
                      <TagBadge
                        key={t.id}
                        label={t.label}
                        color={t.color}
                        effect={t.effect}
                        disabled={busyId === t.id}
                        onRemove={() => toggle(t.id, false)}
                      />
                    ))}
                  </div>
                )}

                <p className="mb-1.5 mt-5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Give a tag
                </p>
                {availableTags.length === 0 ? (
                  <p className="text-xs text-zinc-600">All tags are already assigned.</p>
                ) : (
                  <div className="space-y-1.5">
                    {availableTags.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => toggle(t.id, true)}
                        disabled={busyId !== null}
                        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm transition hover:border-white/25 disabled:opacity-50"
                      >
                        <TagBadge label={t.label} color={t.color} effect={t.effect} />
                        <span className="text-xs text-zinc-400">+ Assign</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
