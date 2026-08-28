'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TagBadge from '@/components/TagBadge';

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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Load the full tag library once, automatically — the widget is only
  // rendered for signed-in admins, so the extra request is cheap.
  useEffect(() => {
    fetch('/api/admin/tags')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setAllTags(d.tags ?? []))
      .catch(() => {
        setAllTags([]);
        setError('Could not load the tag library.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle(tagId: string, want: boolean) {
    setBusyId(tagId);
    setError('');
    // Optimistic update, rolled back if the request fails.
    setAssigned((prev) => {
      const next = new Set(prev);
      if (want) next.add(tagId);
      else next.delete(tagId);
      return next;
    });
    const res = await fetch(`/api/admin/users/${userId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagId, assign: want }),
    });
    setBusyId(null);
    if (!res.ok) {
      setAssigned((prev) => {
        const next = new Set(prev);
        if (want) next.delete(tagId);
        else next.add(tagId);
        return next;
      });
      setError('Change failed — please try again.');
      return;
    }
    router.refresh();
  }

  const active = (allTags ?? []).filter((t) => assigned.has(t.id));
  const available = (allTags ?? []).filter((t) => !assigned.has(t.id));

  return (
    <div className="card mt-6 max-w-xl border-amber-500/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300/90">
          Admin · user tags
        </p>
        {busyId && <span className="text-xs text-zinc-500">saving…</span>}
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}

      {allTags === null ? (
        <p className="mt-3 text-sm text-zinc-500">Loading tag library…</p>
      ) : allTags.length === 0 ? (
        <p className="mt-3 text-sm text-amber-200/70">
          No tags exist yet — create some in the admin panel.
        </p>
      ) : (
        <>
          <div className="mt-3">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              On this profile
            </p>
            {active.length === 0 ? (
              <p className="text-xs text-zinc-600">None yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {active.map((t) => (
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
          </div>

          {available.length > 0 && (
            <div className="mt-3 border-t border-white/5 pt-3">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Give a tag
              </p>
              <div className="flex flex-wrap gap-1.5">
                {available.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => toggle(t.id, true)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/15 bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-zinc-400 transition hover:border-white/35 hover:text-white disabled:opacity-50"
                    style={{ borderColor: `${t.color}44` }}
                  >
                    <span className="text-[10px]">+</span> {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
