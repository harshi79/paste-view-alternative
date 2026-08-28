'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Tag = { id: string; label: string; color: string; effect: string };

/** Admin-only widget: assign/remove tags on a user's profile. */
export default function AdminTags({
  userId,
  initialTagIds,
}: {
  userId: string;
  initialTagIds: string[];
}) {
  const router = useRouter();
  const [allTags, setAllTags] = useState<Tag[] | null>(null);
  const [assigned, setAssigned] = useState<Set<string>>(new Set(initialTagIds));
  const [busy, setBusy] = useState(false);

  async function load() {
    if (allTags) return;
    const res = await fetch('/api/admin/tags');
    if (res.ok) {
      const data = await res.json();
      setAllTags(data.tags);
    } else {
      setAllTags([]);
    }
  }

  async function toggle(tagId: string, want: boolean) {
    setBusy(true);
    const res = await fetch(`/api/admin/users/${userId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagId, assign: want }),
    });
    setBusy(false);
    if (!res.ok) return;
    const next = new Set(assigned);
    if (want) next.add(tagId);
    else next.delete(tagId);
    setAssigned(next);
    router.refresh();
  }

  return (
    <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <button
        type="button"
        onClick={load}
        className="text-xs font-semibold uppercase tracking-wider text-amber-300"
      >
        {allTags ? 'Manage tags' : 'Manage tags (load)'}
      </button>
      {allTags && (
        <div className="mt-3 flex flex-wrap gap-2">
          {allTags.length === 0 && (
            <span className="text-sm text-amber-200/70">No tags exist yet — create some in the admin panel.</span>
          )}
          {allTags.map((t) => {
            const on = assigned.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                disabled={busy}
                onClick={() => toggle(t.id, !on)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition disabled:opacity-50 ${
                  on
                    ? 'text-white shadow-md'
                    : 'border border-white/15 bg-white/5 text-zinc-400 hover:border-white/30 hover:text-white'
                }`}
                style={
                  on
                    ? { background: `linear-gradient(100deg, ${t.color}, ${t.color}aa)` }
                    : undefined
                }
              >
                {on ? '✓ ' : '+ '}
                {t.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
