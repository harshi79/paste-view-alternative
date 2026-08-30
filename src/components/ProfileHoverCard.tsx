'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import Avatar from './Avatar';
import TagBadge from './TagBadge';
import EmojiStatus from './EmojiStatus';
import FollowButton from './FollowButton';
import NameDisplay from './NameDisplay';
import { sanitizeNameEffect, type NameStyle } from '@/lib/nameEffects';
import type { StickerEntry } from '@/lib/stickerPack';

export type ProfileHoverData = {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  statusEmoji: string;
  statusText: string;
  statusSticker?: StickerEntry | null;
  tags: { id: string; label: string; color: string; effect: string | null }[];
  followersCount: number;
  followingCount: number;
  pastesCount: number;
  nameFrom: string;
  nameTo: string;
  nameStyle: NameStyle;
  nameEffect: string;
  effectSpeed: number;
  effectIntensity: number;
};

type Props = {
  data: ProfileHoverData;
  /** Whether the signed-in viewer follows this user (false for guests/self). */
  following: boolean;
  /** True when there is no signed-in session. */
  guest: boolean;
  /** Force the card open on first render (used by tests; otherwise unused). */
  defaultOpen?: boolean;
  /** The clickable identity content this card previews. */
  children: ReactNode;
};

const OPEN_DELAY_MS = 350; // small open delay — prevents flicker on accidental hovers
const CLOSE_DELAY_MS = 250; // grace period — lets the pointer reach the card

/**
 * Compact profile preview attached to an already-clickable profile
 * identity (e.g. the paste author chip).
 *
 * Desktop: hover opens after a short delay; moving the pointer into the
 * card does not close it (the card lives inside the same hover root and
 * the close delay covers the gap); leaving the area closes it.
 *
 * Touch: there is no hover, so the first tap toggles the preview instead
 * of navigating; the preview carries its own "View profile" link.
 */
export default function ProfileHoverCard({
  data,
  following,
  guest,
  defaultOpen = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTouch = useRef<boolean | null>(null);
  const rootRef = useRef<HTMLSpanElement | null>(null);

  function touchDevice(): boolean {
    if (isTouch.current === null) {
      isTouch.current =
        typeof window !== 'undefined' &&
        (window.matchMedia('(hover: none)').matches ||
          window.matchMedia('(pointer: coarse)').matches ||
          navigator.maxTouchPoints > 0);
    }
    return isTouch.current;
  }

  function clearTimers() {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }

  function handleEnter() {
    if (touchDevice()) return;
    clearTimers();
    openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  }

  function handleLeave() {
    if (touchDevice()) return;
    clearTimers();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }

  function handleTriggerClick(e: MouseEvent) {
    if (!touchDevice()) return; // desktop: the identity keeps its normal link behavior
    e.preventDefault();
    clearTimers();
    setOpen((o) => !o);
  }

  // Close when tapping/clicking outside, or on Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: Event) {
      const target = e.target as Node | null;
      if (rootRef.current && target && rootRef.current.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (openTimer.current) clearTimeout(openTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  return (
    <span
      ref={rootRef}
      className="relative inline-flex"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <span className="inline-flex" onClick={handleTriggerClick}>
        {children}
      </span>
      {open && <ProfileHoverCardContent data={data} following={following} guest={guest} />}
    </span>
  );
}

/** The compact preview itself — also used directly by tests. */
export function ProfileHoverCardContent({
  data,
  following,
  guest,
}: {
  data: ProfileHoverData;
  following: boolean;
  guest: boolean;
}) {
  const name = data.displayName || data.username;
  return (
    <span
      role="dialog"
      aria-label={`${name}'s profile preview`}
      className="animate-pop absolute left-0 top-[calc(100%+0.625rem)] z-50 w-72 max-w-[calc(100vw-2rem)] rounded-[20px] border border-white/10 bg-night-900/95 p-3.5 text-left shadow-2xl shadow-black/60 backdrop-blur-xl"
    >
      <span className="flex items-start gap-3">
        <Link
          href={`/u/${data.username}`}
          className="shrink-0"
          aria-label={`View ${name}'s profile`}
        >
          <Avatar value={data.avatarUrl} label={name} className="h-12 w-12" />
        </Link>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <Link
              href={`/u/${data.username}`}
              className="min-w-0 break-words text-base font-black leading-tight tracking-tight text-white transition-opacity hover:opacity-80"
            >
              <NameDisplay
                text={name}
                from={data.nameFrom}
                to={data.nameTo}
                style={data.nameStyle}
                effect={sanitizeNameEffect(data.nameEffect)}
                speed={data.effectSpeed}
                intensity={data.effectIntensity}
              />
            </Link>
            {data.tags.map((tag) => (
              <TagBadge key={tag.id} label={tag.label} color={tag.color} effect={tag.effect} size="sm" />
            ))}
            <EmojiStatus
              value={data.statusEmoji}
              pack={data.statusSticker ? [data.statusSticker] : undefined}
              className="inline-flex items-center text-base leading-none"
              title={data.statusText || 'Status'}
            />
          </span>
          <span className="mt-1 block truncate text-xs text-zinc-500">@{data.username}</span>
          {data.statusText && (
            <span className="mt-0.5 block truncate text-xs text-zinc-400">{data.statusText}</span>
          )}
        </span>
      </span>

      <span className="mt-3 flex items-center gap-4 border-t border-white/5 pt-2.5 text-xs text-zinc-400">
        <span>
          <span className="font-bold text-white">{data.followersCount.toLocaleString()}</span>{' '}
          Followers
        </span>
        <span>
          <span className="font-bold text-white">{data.followingCount.toLocaleString()}</span>{' '}
          Following
        </span>
        <span>
          <span className="font-bold text-white">{data.pastesCount.toLocaleString()}</span> Pastes
        </span>
      </span>

      <span className="mt-2.5 flex w-full">
        <FollowButton
          username={data.username}
          initialFollowing={following}
          guest={guest}
          size="sm"
          fullWidth
        />
      </span>
    </span>
  );
}
