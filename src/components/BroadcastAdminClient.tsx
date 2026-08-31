'use client';

import { useEffect, useRef, useState } from 'react';
import { loadStickerPack, type StickerEntry } from '@/lib/stickerPack';
import BroadcastMessage from './BroadcastMessage';

/** Match POST /api/admin/notifications limits. */
export const MAX_TITLE = 120;
export const MAX_MESSAGE = 500;

const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400';

export default function BroadcastAdminClient({ userCount = 0 }: { userCount?: number }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [pack, setPack] = useState<StickerEntry[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recipients, setRecipients] = useState<number | null>(null);
  const inFlight = useRef(false);

  const titleValue = title.trim();
  const messageValue = message.trim();
  const canCompose = Boolean(titleValue && messageValue) && !busy;

  // Pre-load the sticker pack so the live preview resolves `:wave:` the
  // same way the final message popup will (shared module-level cache).
  useEffect(() => {
    let cancelled = false;
    loadStickerPack().then((p) => {
      if (!cancelled) setPack(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function requestConfirm() {
    if (!canCompose || inFlight.current) return;
    setError('');
    setRecipients(null);
    setConfirming(true);
  }

  async function send() {
    if (inFlight.current) return;
    inFlight.current = true;
    const nextTitle = title.trim().slice(0, MAX_TITLE);
    const nextMessage = message.trim().slice(0, MAX_MESSAGE);
    if (!nextTitle || !nextMessage) {
      inFlight.current = false;
      return;
    }

    setBusy(true);
    setError('');
    setRecipients(null);
    try {
      // URLs live inside `message` (the composer has no separate link
      // field anymore); the backend keeps accepting `link` for backward
      // compatibility but the new UI never sends it.
      const res = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nextTitle, message: nextMessage }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: unknown;
        recipients?: unknown;
      };
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not send broadcast.');
        return;
      }
      const n = Number(data.recipients ?? 0);
      setRecipients(Number.isFinite(n) ? n : 0);
      setTitle('');
      setMessage('');
      setConfirming(false);
    } catch {
      setError('Could not send broadcast.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function cancelConfirm() {
    if (busy) return;
    setConfirming(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (confirming) void send();
    else requestConfirm();
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
      <form onSubmit={onSubmit} className="card p-5" aria-busy={busy || undefined}>
        <h2 className="mb-1 font-bold text-white">New broadcast</h2>
        <p className="mb-4 text-sm text-zinc-500">
          {userCount > 0
            ? `Delivers one ADMIN notification to all ${userCount.toLocaleString()} registered user${userCount === 1 ? '' : 's'}.`
            : 'Delivers one ADMIN notification to every registered user.'}
        </p>

        <div className="space-y-3">
          <div>
            <label htmlFor="broadcast-title" className={labelCls}>
              Title
            </label>
            <input
              id="broadcast-title"
              name="title"
              className="input"
              value={title}
              maxLength={MAX_TITLE}
              placeholder="e.g. Scheduled maintenance"
              disabled={busy || confirming}
              onChange={(e) => {
                setTitle(e.target.value);
                setRecipients(null);
              }}
            />
            <p className="mt-1 text-right font-mono text-[11px] text-zinc-600">
              {title.length}/{MAX_TITLE}
            </p>
          </div>

          <div>
            <label htmlFor="broadcast-message" className={labelCls}>
              Message
            </label>
            <textarea
              id="broadcast-message"
              name="message"
              className="input min-h-28 resize-y"
              value={message}
              maxLength={MAX_MESSAGE}
              placeholder={'Hello :wave:\n\nThis is important.\n\nVisit https://example.com'}
              disabled={busy || confirming}
              rows={5}
              onChange={(e) => {
                setMessage(e.target.value);
                setRecipients(null);
              }}
            />
            <p className="mt-1 text-xs text-zinc-600">
              Sticker tokens like :wave: and URLs are supported — write links directly in the
              message.
            </p>
            <p className="mt-1 text-right font-mono text-[11px] text-zinc-600">
              {message.length}/{MAX_MESSAGE}
            </p>
          </div>

          {error && (
            <p className="feedback-error" role="alert">
              {error}
            </p>
          )}
          {recipients !== null && !error && (
            <p className="feedback-success" role="status">
              Sent to {recipients.toLocaleString()} recipient{recipients === 1 ? '' : 's'}.
            </p>
          )}

          {confirming ? (
            <div
              className="rounded-lg border-2 border-amber-400/40 bg-amber-500/10 p-4"
              role="alertdialog"
              aria-labelledby="broadcast-confirm-title"
              aria-describedby="broadcast-confirm-body"
            >
              <p id="broadcast-confirm-title" className="font-bold text-amber-100">
                Send to everyone?
              </p>
              <p id="broadcast-confirm-body" className="mt-1 text-sm text-amber-100/80">
                {userCount > 0
                  ? `This will notify all ${userCount.toLocaleString()} registered user${userCount === 1 ? '' : 's'}. This cannot be undone.`
                  : 'This will notify every registered user. This cannot be undone.'}
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="submit"
                  disabled={busy}
                  className="btn-primary min-h-11 flex-1 px-4 py-2 text-xs sm:min-h-0"
                >
                  {busy ? 'Sending…' : 'Confirm send'}
                </button>
                <button
                  type="button"
                  onClick={cancelConfirm}
                  disabled={busy}
                  className="btn-ghost min-h-11 flex-1 px-4 py-2 text-xs sm:min-h-0"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="submit"
              disabled={!canCompose}
              className="btn-primary min-h-11 w-full font-bold sm:min-h-0"
            >
              Send to everyone
            </button>
          )}
        </div>
      </form>

      <div className="card h-fit p-5 lg:sticky lg:top-20">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-zinc-500">Preview</p>
        <div className="rounded-lg border-2 border-amber-400/25 bg-amber-400/5 p-4">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">
            Admin
          </p>
          <p
            className={`mt-2 break-words text-sm font-semibold ${titleValue ? 'admin-broadcast-title' : 'text-zinc-600'}`}
          >
            {titleValue || 'Title'}
          </p>
          <div className="mt-1.5">
            {messageValue ? (
              <BroadcastMessage text={messageValue} pack={pack} />
            ) : (
              <p className="text-xs leading-5 text-zinc-600">Message</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
