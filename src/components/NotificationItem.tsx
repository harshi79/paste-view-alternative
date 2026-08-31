'use client';

import Link from 'next/link';
import type { NotificationRow, NotificationType } from '@/lib/notifications';
import { timeAgo } from '@/lib/format';

export type NotificationItemProps = {
  notification: NotificationRow;
  /** The user activated (clicked) the notification — the bell marks it read. */
  onActivate: (notification: NotificationRow) => void;
  /** Explicit "Mark as read" control (used when there is nothing to open). */
  onMarkRead: (notification: NotificationRow) => void;
  /** Presentation-only variant for the dedicated notification center. */
  variant?: 'dropdown' | 'center';
  /** Disables the center row's explicit mark-read control while it is saving. */
  busy?: boolean;
};

function NotificationTypeIcon({ type }: { type: NotificationType }) {
  const tone =
    type === 'LIKE'
      ? 'border-rose-400/25 bg-rose-400/10 text-rose-300'
      : type === 'NEW_POST'
        ? 'border-cyan-400/25 bg-cyan-400/10 text-cyan-300'
        : type === 'ADMIN'
          ? 'border-amber-400/25 bg-amber-400/10 text-amber-300'
          : 'border-brand-400/25 bg-brand-400/10 text-brand-300';

  return (
    <span
      aria-hidden
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-md border-2 ${tone}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        {type === 'FOLLOW' && (
          <>
            <path d="M15 20a6 6 0 0 0-12 0" />
            <circle cx="9" cy="7" r="3.5" />
            <path d="M19 8v6m-3-3h6" />
          </>
        )}
        {type === 'LIKE' && (
          <path d="M20.84 8.61a5.5 5.5 0 0 0-7.78 0L12 9.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
        )}
        {type === 'NEW_POST' && (
          <>
            <path d="M4 5h16v14H4z" />
            <path d="M8 9h8M8 13h5" />
            <path d="M18 3v4m-2-2h4" />
          </>
        )}
        {type === 'ADMIN' && (
          <>
            <path d="M4 10.5v3l10 3V7.5l-10 3Z" />
            <path d="M14 9.5a3 3 0 0 1 0 5M6 16.5l1.5 3h2L8 16" />
          </>
        )}
      </svg>
    </span>
  );
}

/**
 * One notification row inside the bell dropdown / mobile sheet, or the
 * expanded presentation used by the full notification center.
 *
 * Purely presentational — it renders the exact strings the Chat 1 API
 * returned (title/message/link) and links them to their real targets:
 *   FOLLOW   → actor username links to /u/<username>
 *   LIKE     → actor links to /u/<username>, paste title to /p/<id>
 *   NEW_POST → actor + a compact embedded preview of the exact paste
 *   ADMIN    → stored title/message/link, no actor
 *
 * All mutation (mark-read API calls, list state) lives in the parent.
 */
export default function NotificationItem({
  notification,
  onActivate,
  onMarkRead,
  variant = 'dropdown',
  busy = false,
}: NotificationItemProps) {
  const center = variant === 'center';
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
      aria-busy={busy || undefined}
      onClick={
        center && !n.isRead
          ? (event) => {
              const target = event.target as Element | null;
              if (!target?.closest('a,button')) onActivate(n);
            }
          : undefined
      }
      className={
        center
          ? `card relative flex gap-3.5 overflow-hidden rounded-lg px-4 py-4 transition-all sm:px-5 sm:py-5 ${
              n.isRead
                ? 'bg-[color:var(--vb-panel)]'
                : 'border-brand-400/55 bg-brand-500/[0.08] shadow-[5px_5px_0_0_rgba(139,92,246,0.25)]'
            } ${busy ? 'opacity-70' : 'hover:border-[#40404f] hover:-translate-y-0.5'}`
          : `relative flex gap-2.5 px-3.5 py-3 transition-colors md:px-4 ${
              n.isRead ? 'bg-transparent' : 'bg-brand-500/[0.08]'
            }`
      }
    >
      {center ? (
        <>
          <NotificationTypeIcon type={n.type} />
          <span className="absolute right-4 top-4" aria-hidden>
            {n.isRead ? (
              <span className="block h-2 w-2 rounded-full border border-[color:var(--vb-line)] bg-transparent" />
            ) : (
              <span className="block h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
            )}
          </span>
          {!n.isRead && <span className="sr-only">Unread</span>}
        </>
      ) : (
        <>
          {/* Unread indicator — red dot for unread, quiet ring for read. */}
          <span className="mt-1.5 flex h-2 w-2 shrink-0 items-start" aria-hidden>
            {n.isRead ? (
              <span className="block h-2 w-2 rounded-full border border-[color:var(--vb-line)] bg-transparent" />
            ) : (
              <span className="block h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
            )}
          </span>
          {!n.isRead && <span className="sr-only">Unread</span>}
        </>
      )}

      <div className="min-w-0 flex-1">
        <p
          className={
            center
              ? 'break-words text-sm leading-snug text-zinc-300 sm:text-[15px]'
              : 'text-sm leading-snug text-zinc-300'
          }
        >
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
            <span className={center ? 'break-words font-semibold text-white' : 'font-semibold text-white'}>
              {n.title}
            </span>
          )}
          <span
            className={
              center
                ? 'ml-2 whitespace-nowrap text-xs text-zinc-500'
                : 'ml-1.5 whitespace-nowrap text-xs text-zinc-500'
            }
          >
            · {time}
          </span>
        </p>

        {/* LIKE — the exact post the actor liked, linked to /p/<id>. */}
        {n.type === 'LIKE' && pasteHref && (
          <Link
            href={pasteHref}
            onClick={() => onActivate(n)}
            title={n.message || undefined}
            aria-label={n.message ? `View post: ${n.message}` : 'View post'}
            className={
              center
                ? 'mt-2 block break-words text-sm font-semibold leading-5 text-brand-300 transition-colors hover:text-brand-200'
                : 'mt-1 block truncate text-sm font-semibold text-brand-300 transition-colors hover:text-brand-200'
            }
          >
            {n.message || 'View post'}
          </Link>
        )}

        {/* NEW_POST — embedded preview of the exact new paste. */}
        {n.type === 'NEW_POST' && pasteHref && (
          <Link
            href={pasteHref}
            onClick={() => onActivate(n)}
            aria-label={n.message ? `View post: ${n.message}` : 'View post'}
            className={
              center
                ? 'mt-3 block rounded-md border-2 border-[color:var(--vb-line-soft)] bg-[color:var(--vb-inset)] px-3 py-3 transition-colors hover:border-[color:var(--vb-line)] hover:bg-[#15151f]'
                : 'mt-2 block rounded-md border border-[color:var(--vb-line-soft)] bg-[color:var(--vb-inset)] px-2.5 py-2 transition-colors hover:border-[color:var(--vb-line)] hover:bg-[#15151f]'
            }
          >
            {n.message && (
              <span
                className={
                  center
                    ? 'block break-words text-sm font-semibold leading-5 text-zinc-200'
                    : 'block truncate text-sm font-semibold text-zinc-200'
                }
              >
                {n.message}
              </span>
            )}
            <span
              className={`block font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-brand-300 ${
                center ? 'mt-1' : 'mt-0.5'
              }`}
            >
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
                className={
                  center
                    ? 'mt-1.5 inline-block min-h-11 py-3 text-xs font-bold uppercase tracking-wide text-brand-300 transition-colors hover:text-brand-200 sm:min-h-0 sm:py-0'
                    : 'mt-1.5 inline-block text-xs font-bold uppercase tracking-wide text-brand-300 transition-colors hover:text-brand-200'
                }
              >
                Open →
              </Link>
            )}
            {!n.link && !n.isRead && (
              <button
                type="button"
                onClick={() => onMarkRead(n)}
                disabled={center ? busy : undefined}
                className={
                  center
                    ? 'mt-1.5 min-h-11 rounded-md border border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400 transition-colors hover:border-[#40404f] hover:text-white disabled:opacity-50 sm:min-h-0'
                    : 'mt-1.5 rounded-md border border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400 transition-colors hover:border-[#40404f] hover:text-white'
                }
              >
                {center && busy ? 'Saving…' : 'Mark as read'}
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}
