'use client';

import Link from 'next/link';
import type { NotificationRow } from '@/lib/notifications';
import { timeAgo } from '@/lib/format';

export type NotificationItemProps = {
  notification: NotificationRow;
  /** The user activated (clicked) the notification — the bell marks it read. */
  onActivate: (notification: NotificationRow) => void;
  /** Explicit "Mark as read" control (used when there is nothing to open). */
  onMarkRead: (notification: NotificationRow) => void;
};

/**
 * One notification row inside the bell dropdown / mobile sheet.
 *
 * Purely presentational — it renders the exact strings the Chat 1 API
 * returned (title/message/link) and links them to their real targets:
 *   FOLLOW   → actor username links to /u/<username>
 *   LIKE     → actor links to /u/<username>, paste title to /p/<id>
 *   NEW_POST → actor + a compact embedded preview of the exact paste
 *   ADMIN    → stored title/message/link, no actor
 *
 * All mutation (mark-read API calls, list state) lives in NotificationBell.
 */
export default function NotificationItem({
  notification,
  onActivate,
  onMarkRead,
}: NotificationItemProps) {
  const n = notification;
  const time = timeAgo(new Date(n.createdAt));
  const actorHref = n.actor ? `/u/${n.actor.username}` : null;
  const pasteHref = n.pasteId ? `/p/${n.pasteId}` : null;

  // FOLLOW/LIKE/NEW_POST titles are written by the backend as
  // "@username <verb>". Split exactly there so the username becomes the
  // profile link while the stored title text is preserved verbatim.
  const prefix = n.actor ? `@${n.actor.username}` : null;
  const linkedTitle = prefix !== null && n.title.startsWith(prefix);
  const verb = linkedTitle ? n.title.slice(prefix!.length) : '';

  return (
    <li
      data-notification-id={n.id}
      data-notification-type={n.type}
      className={`relative flex gap-2.5 px-3.5 py-3 transition-colors md:px-4 ${
        n.isRead ? 'bg-transparent' : 'bg-brand-500/[0.08]'
      }`}
    >
      {/* Unread indicator — red dot for unread, quiet ring for read. */}
      <span className="mt-1.5 flex h-2 w-2 shrink-0 items-start" aria-hidden>
        {n.isRead ? (
          <span className="block h-2 w-2 rounded-full border border-[color:var(--vb-line)] bg-transparent" />
        ) : (
          <span className="block h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
        )}
      </span>
      {!n.isRead && <span className="sr-only">Unread</span>}

      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-zinc-300">
          {linkedTitle ? (
            <>
              <Link
                href={actorHref!}
                onClick={() => onActivate(n)}
                className="font-bold text-white transition-colors hover:text-brand-300"
                aria-label={`View @${n.actor!.username}'s profile`}
              >
                @{n.actor!.username}
              </Link>
              <span>{verb}</span>
            </>
          ) : (
            <span className="font-semibold text-white">{n.title}</span>
          )}
          <span className="ml-1.5 whitespace-nowrap text-xs text-zinc-500">· {time}</span>
        </p>

        {/* LIKE — the exact post the actor liked, linked to /p/<id>. */}
        {n.type === 'LIKE' && pasteHref && (
          <Link
            href={pasteHref}
            onClick={() => onActivate(n)}
            title={n.message || undefined}
            aria-label={n.message ? `View post: ${n.message}` : 'View post'}
            className="mt-1 block truncate text-sm font-semibold text-brand-300 transition-colors hover:text-brand-200"
          >
            {n.message || 'View post'}
          </Link>
        )}

        {/* NEW_POST — compact embedded preview of the exact new paste. */}
        {n.type === 'NEW_POST' && pasteHref && (
          <Link
            href={pasteHref}
            onClick={() => onActivate(n)}
            aria-label={n.message ? `View post: ${n.message}` : 'View post'}
            className="mt-2 block rounded-md border border-[color:var(--vb-line-soft)] bg-[color:var(--vb-inset)] px-2.5 py-2 transition-colors hover:border-[color:var(--vb-line)] hover:bg-[#15151f]"
          >
            {n.message && (
              <span className="block truncate text-sm font-semibold text-zinc-200">{n.message}</span>
            )}
            <span className="mt-0.5 block font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-brand-300">
              View post →
            </span>
          </Link>
        )}

        {/* ADMIN — the stored broadcast title/message/link, rendered cleanly. */}
        {n.type === 'ADMIN' && (
          <>
            {n.message && (
              <p className="mt-1 break-words text-xs leading-5 text-zinc-400">{n.message}</p>
            )}
            {n.link && (
              <Link
                href={n.link}
                onClick={() => onActivate(n)}
                className="mt-1.5 inline-block text-xs font-bold uppercase tracking-wide text-brand-300 transition-colors hover:text-brand-200"
              >
                Open →
              </Link>
            )}
            {!n.link && !n.isRead && (
              <button
                type="button"
                onClick={() => onMarkRead(n)}
                className="mt-1.5 rounded-md border border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400 transition-colors hover:border-[#40404f] hover:text-white"
              >
                Mark as read
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}
