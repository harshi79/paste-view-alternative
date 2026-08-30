'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Pin / delete controls shown to the paste owner. */
export default function OwnerActions({
  pasteId,
  pinned,
  compact = false,
}: {
  pasteId: string;
  pinned: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function togglePin() {
    setBusy(true);
    await fetch(`/api/pastes/${pasteId}/pin`, { method: 'POST' });
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/pastes/${pasteId}`, { method: 'DELETE' });
    if (res.ok) {
      router.push('/dashboard');
      router.refresh();
    } else {
      setBusy(false);
      setConfirming(false);
    }
  }

  const btn = compact
    ? 'btn-ghost !px-3 !py-2 text-xs'
    : 'btn-ghost !justify-center !px-3.5 !py-2 text-xs xl:w-full';

  return (
    <span className="inline-flex w-full flex-wrap items-center gap-2 xl:flex-col xl:items-stretch">
      <button onClick={togglePin} disabled={busy} className={btn} title="Show on top of your profile">
        {pinned ? '📌 Unpin' : '📌 Pin'}
      </button>
      {confirming ? (
        <span className="inline-flex w-full flex-wrap items-center gap-2 xl:flex-col xl:items-stretch">
          <button
            onClick={remove}
            disabled={busy}
            className="rounded-xl border border-red-500/40 bg-red-500/20 px-3.5 py-2 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/30 disabled:opacity-50 xl:w-full"
          >
            Really delete?
          </button>
          <button onClick={() => setConfirming(false)} className={btn}>
            Cancel
          </button>
        </span>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          disabled={busy}
          className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50 xl:w-full"
        >
          Delete
        </button>
      )}
    </span>
  );
}
