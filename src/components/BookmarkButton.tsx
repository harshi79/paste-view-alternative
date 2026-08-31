'use client';

import { useState } from 'react';

type Props = {
  pasteId: string;
  initialBookmarked: boolean;
  /** True when there is no signed-in session — Save redirects to /register (same convention as FollowButton). */
  guest?: boolean;
};

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill={filled ? 'currentColor' : 'none'}
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        d="M5.5 3.5h9a.5.5 0 0 1 .5.5v12.6l-5-3.8-5 3.8V4a.5.5 0 0 1 .5-.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Bookmark / remove-bookmark toggle for a paste. Signed-in users only —
 * the server owns the state (no anonymous bookmarks the way likes have);
 * this component just renders it optimistically and reconciles with the
 * response. Guests follow the existing FollowButton convention and are
 * routed to /register with the paste preserved (?next=/p/…). The busy
 * flag guards against double clicks so a bookmark can never double-fire.
 */
export default function BookmarkButton({ pasteId, initialBookmarked, guest = false }: Props) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function sendToRegister() {
    window.location.href = `/register?next=${encodeURIComponent(`/p/${pasteId}`)}`;
  }

  async function toggle() {
    if (busy) return;
    setError('');
    if (guest) {
      sendToRegister();
      return;
    }
    setBusy(true);
    const next = !bookmarked;
    setBookmarked(next);
    try {
      const res = await fetch(`/api/pastes/${pasteId}/bookmark`, {
        method: next ? 'POST' : 'DELETE',
      });
      if (res.status === 401) {
        // Session expired (or was cleared) while the page was open —
        // same guest flow as FollowButton: register and come back.
        sendToRegister();
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update bookmark.');
      setBookmarked(!!data.bookmarked);
    } catch (e) {
      setBookmarked(!next);
      setError(e instanceof Error ? e.message : 'Could not update bookmark.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={bookmarked}
        aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this paste'}
        title={bookmarked ? 'Saved — click to remove' : 'Save'}
        disabled={busy}
        className={`inline-flex items-center justify-center gap-1.5 rounded-md border-2 px-3 py-2 text-xs font-bold uppercase tracking-wide transition-all active:translate-x-px active:translate-y-px disabled:cursor-wait disabled:opacity-60 ${
          bookmarked
            ? 'border-brand-400/70 bg-brand-500/15 text-brand-300 shadow-[2px_2px_0_0_var(--vb-ink)] hover:bg-brand-500/25'
            : 'border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] text-zinc-300 hover:border-brand-400/50 hover:text-brand-300'
        }`}
      >
        <BookmarkIcon filled={bookmarked} />
        <span>{bookmarked ? 'Saved' : 'Save'}</span>
      </button>
      {error && (
        <span role="status" className="max-w-[12rem] text-[11px] leading-4 text-red-400">
          {error}
        </span>
      )}
    </span>
  );
}
