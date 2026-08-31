'use client';

import { useState } from 'react';

type Props = {
  pasteId: string;
  initialCount: number;
  initialLiked: boolean;
};

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill={filled ? 'currentColor' : 'none'}
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        d="M10 16.6 3.6 10.4a3.9 3.9 0 0 1 0-5.5 3.85 3.85 0 0 1 5.45 0l.95.95.95-.95a3.85 3.85 0 0 1 5.45 0 3.9 3.9 0 0 1 0 5.5L10 16.6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Like / unlike toggle for a paste. One vote per user (or per anonymous
 * IP hash) — the server owns the state; this component just renders it
 * optimistically and reconciles. No dislike: the button is a single
 * heart that fills when liked.
 */
export default function LikeButton({ pasteId, initialCount, initialLiked }: Props) {
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(initialLiked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function toggle() {
    if (busy) return;
    setError('');
    setBusy(true);
    const nextLiked = !liked;
    setLiked(nextLiked);
    setCount((c) => Math.max(0, c + (nextLiked ? 1 : -1)));
    try {
      const res = await fetch(`/api/pastes/${pasteId}/like`, {
        method: nextLiked ? 'POST' : 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update like.');
      setLiked(data.liked);
      setCount(data.count);
    } catch (e) {
      setLiked(liked);
      setCount((c) => Math.max(0, c + (liked ? 1 : -1)));
      setError(e instanceof Error ? e.message : 'Could not update like.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={liked}
        aria-label={liked ? 'Unlike this paste' : 'Like this paste'}
        title={liked ? 'Unlike' : 'Like'}
        disabled={busy}
        className={`inline-flex items-center justify-center gap-1.5 rounded-md border-2 px-3 py-2 text-xs font-bold uppercase tracking-wide transition-all active:translate-x-px active:translate-y-px disabled:opacity-60 ${
          liked
            ? 'border-rose-400/70 bg-rose-500/15 text-rose-300 shadow-[2px_2px_0_0_var(--vb-ink)] hover:bg-rose-500/25'
            : 'border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] text-zinc-300 hover:border-rose-400/50 hover:text-rose-300'
        }`}
      >
        <Heart filled={liked} />
        <span aria-live="polite">{count.toLocaleString()}</span>
        <span>{liked ? 'Liked' : 'Like'}</span>
      </button>
      {error && (
        <span role="status" className="text-[11px] text-red-400">
          {error}
        </span>
      )}
    </span>
  );
}
