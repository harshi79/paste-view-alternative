'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Avatar from './Avatar';
import TagBadge from './TagBadge';
import EmojiStatus from './EmojiStatus';
import FollowButton from './FollowButton';
import { loadStickerPack, type StickerEntry } from '@/lib/stickerPack';

export type FollowListUser = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  statusEmoji: string;
  statusText: string;
  tags: { id: string; label: string; color: string; effect: string | null }[];
  isFollowing: boolean;
  isOwn: boolean;
};

type Props = {
  /** Profile owner whose followers/following are shown. */
  username: string;
  followersCount: number;
  followingCount: number;
  /** True when there is no signed-in session (follow buttons redirect to /register). */
  guest: boolean;
};

/**
 * Follower/following counts (chips) + the modal user list opened by
 * clicking them. The list is fetched from the public follow-list API;
 * each row shows avatar, display name, @username, tags, status emoji
 * and a follow action reflecting the current state.
 */
export default function FollowStats({ username, followersCount, followingCount, guest }: Props) {
  const [open, setOpen] = useState<null | 'followers' | 'following'>(null);
  const [users, setUsers] = useState<FollowListUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stickers, setStickers] = useState<StickerEntry[] | null>(null);

  const load = useCallback(
    async (kind: 'followers' | 'following') => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(username)}/followers?kind=${kind}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load the list.');
        setUsers(Array.isArray(data.users) ? data.users : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load the list.');
        setUsers(null);
      } finally {
        setLoading(false);
      }
    },
    [username],
  );

  useEffect(() => {
    if (!open) return;
    setUsers(null);
    void load(open);
    if (!stickers) {
      loadStickerPack().then(setStickers).catch(() => setStickers([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, load]);

  // Close on Escape + lock background scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(null);
    }
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const chip = (n: number, label: string) => `${n.toLocaleString()} ${label}`;

  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen('followers')}
          className="chip transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white"
          aria-haspopup="dialog"
          aria-expanded={open === 'followers'}
        >
          {chip(followersCount, followersCount === 1 ? 'follower' : 'followers')}
        </button>
        <button
          type="button"
          onClick={() => setOpen('following')}
          className="chip transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white"
          aria-haspopup="dialog"
          aria-expanded={open === 'following'}
        >
          {chip(followingCount, 'following')}
        </button>
      </span>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[8vh] backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={open === 'followers' ? 'Followers' : 'Following'}
            className="animate-pop w-full max-w-md overflow-hidden rounded-[24px] border border-white/10 bg-night-900/95 shadow-2xl shadow-black/60 backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-3.5">
              <h3 className="text-sm font-bold text-white">
                {open === 'followers' ? 'Followers' : 'Following'}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(null)}
                aria-label="Close list"
                className="grid h-8 w-8 place-items-center rounded-full text-lg leading-none text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="max-h-[min(24rem,60vh)] overflow-y-auto p-2">
              {loading ? (
                <p className="px-4 py-8 text-center text-sm text-zinc-500">Loading…</p>
              ) : error ? (
                <p role="status" className="px-4 py-8 text-center text-sm text-red-400">
                  {error}
                </p>
              ) : users && users.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-zinc-500">
                  {open === 'followers'
                    ? 'No followers yet — this profile is still warming up.'
                    : 'Not following anyone yet.'}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {users?.map((u) => (
                    <li
                      key={u.username}
                      className="flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors hover:bg-white/[0.04]"
                    >
                      <Link
                        href={`/u/${u.username}`}
                        className="flex min-w-0 flex-1 items-center gap-3"
                        onClick={() => setOpen(null)}
                      >
                        <Avatar
                          value={u.avatarUrl}
                          label={u.displayName || u.username}
                          className="h-10 w-10 shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                            <span className="truncate text-sm font-semibold text-white">
                              {u.displayName || u.username}
                            </span>
                            {u.tags.map((tag) => (
                              <TagBadge
                                key={tag.id}
                                label={tag.label}
                                color={tag.color}
                                effect={tag.effect}
                                size="sm"
                              />
                            ))}
                            <EmojiStatus
                              value={u.statusEmoji}
                              pack={stickers}
                              className="inline-flex items-center text-base leading-none"
                            />
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-zinc-500">
                            @{u.username}
                            {u.statusText ? (
                              <span className="text-zinc-600"> · {u.statusText}</span>
                            ) : null}
                          </span>
                        </span>
                      </Link>
                      {!u.isOwn && (
                        <FollowButton
                          username={u.username}
                          initialFollowing={u.isFollowing}
                          guest={guest}
                          size="sm"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
