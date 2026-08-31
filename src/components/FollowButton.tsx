'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  /** Profile being followed. */
  username: string;
  initialFollowing?: boolean;
  /** True when there is no signed-in session — Follow redirects to /register. */
  guest?: boolean;
  size?: 'sm' | 'md';
  /** Stretch the button to fill its container (used in the hover card). */
  fullWidth?: boolean;
  className?: string;
  /** Called with the new state after a successful follow/unfollow. */
  onChanged?: (following: boolean) => void;
};

/**
 * Follow / Following toggle. Reuses the existing session cookie through
 * the follow API; guests are routed to /register with the profile
 * preserved (?next=/u/…). Idempotent on the server, busy-guarded on the
 * client so rapid clicks cannot double-fire.
 */
export default function FollowButton({
  username,
  initialFollowing = false,
  guest = false,
  size = 'md',
  fullWidth = false,
  className = '',
  onChanged,
}: Props) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function sendToRegister() {
    window.location.href = `/register?next=${encodeURIComponent(`/u/${username}`)}`;
  }

  async function toggle() {
    if (busy) return;
    setError('');
    if (guest) {
      sendToRegister();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}/follow`, {
        method: following ? 'DELETE' : 'POST',
      });
      if (res.status === 401) {
        // Session expired (or was cleared) while the page was open —
        // same guest flow: go register and come back to this profile.
        sendToRegister();
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not update follow state.');
        return;
      }
      setFollowing(!!data.following);
      onChanged?.(!!data.following);
      router.refresh();
    } catch {
      setError('Could not update follow state.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className={`inline-flex items-center gap-2 ${fullWidth ? 'w-full' : ''} ${className}`}>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={following}
        aria-label={following ? `Unfollow ${username}` : `Follow ${username}`}
        className={`group inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border-2 font-bold uppercase tracking-wide transition-all active:translate-x-px active:translate-y-px disabled:cursor-wait disabled:opacity-60 ${
          fullWidth ? 'w-full' : ''
        } ${size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm'} ${
          following
            ? 'border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] text-zinc-200 hover:border-rose-400/50 hover:bg-rose-500/10 hover:text-rose-300'
            : 'border-[#0c0c13] bg-brand-600 text-white shadow-[3px_3px_0_0_var(--vb-ink)] hover:-translate-x-px hover:-translate-y-px hover:bg-brand-500 hover:shadow-[4px_4px_0_0_var(--vb-ink)]'
        }`}
      >
        {following ? (
          <>
            <span aria-hidden className="group-hover:hidden">
              ✓ Following
            </span>
            <span aria-hidden className="hidden group-hover:inline">
              Unfollow
            </span>
          </>
        ) : (
          <span>Follow</span>
        )}
      </button>
      {error && (
        <span role="status" className="max-w-[12rem] text-[11px] leading-4 text-red-400">
          {error}
        </span>
      )}
    </span>
  );
}
