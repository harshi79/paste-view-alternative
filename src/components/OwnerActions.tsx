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

  const btn = 'btn-ghost !px-3.5 !py-2 text-xs font-semibold';

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={togglePin}
        disabled={busy}
        className={btn}
        title="Show on top of your profile"
      >
        {pinned ? '📌 Unpin' : '📌 Pin'}
      </button>
      {confirming ? (
        <span className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="rounded-xl border border-red-500/40 bg-red-500/20 px-3.5 py-2 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/30 disabled:opacity-50"
          >
            Really delete?
          </button>
          <button type="button" onClick={() => setConfirming(false)} className={btn}>
            Cancel
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy}
          className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-zinc-200 transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
        >
          Delete
        </button>
      )}
    </span>
  );
}
