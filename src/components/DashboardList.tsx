'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CopyButton from './CopyButton';
import { formatViews } from '@/lib/format';

type Row = {
  id: string;
  title: string;
  language: string;
  visibility: string;
  views: number;
  pinned: boolean;
  hasPassword: boolean;
  expiresAt: string | null;
  createdAt: string;
};

export default function DashboardList({
  pastes,
  displayName,
  highlightId,
}: {
  pastes: Row[];
  displayName: string;
  highlightId: string | null;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Build the share URL on-demand so we never render the full text id
  // in the DOM unprompted.
  function shareUrl(id: string): string {
    if (typeof window === 'undefined') return `/p/${id}`;
    return `${window.location.origin}/p/${id}`;
  }

  async function togglePin(id: string) {
    setBusyId(id);
    await fetch(`/api/pastes/${id}/pin`, { method: 'POST' });
    setBusyId(null);
    router.refresh();
  }

  async function remove(id: string) {
    setBusyId(id);
    await fetch(`/api/pastes/${id}`, { method: 'DELETE' });
    setBusyId(null);
    setConfirmId(null);
    router.refresh();
  }

  if (pastes.length === 0) {
    return (
      <div className="animate-pop rounded-2xl border border-dashed border-white/10 p-14 text-center">
        <p className="text-4xl">📭</p>
        <p className="mt-3 font-semibold text-zinc-300">No pastes yet, {displayName}</p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-600/30 hover:brightness-110"
        >
          Create your first paste
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-3">
      {pastes.map((p) => {
        const expired = p.expiresAt && new Date(p.expiresAt).getTime() <= Date.now();
        const isNew = highlightId === p.id;
        return (
          <div
            key={p.id}
            className={`flex flex-wrap items-center gap-3 rounded-2xl border bg-night-800/60 p-4 transition-colors ${
              isNew
                ? 'border-emerald-400/40 shadow-lg shadow-emerald-500/10'
                : expired
                  ? 'border-red-500/20 opacity-70'
                  : 'border-white/10 hover:border-white/20'
            } ${busyId === p.id ? 'animate-pulse' : ''}`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/p/${p.id}`}
                  className="truncate font-semibold text-zinc-100 hover:text-brand-300"
                >
                  {p.pinned && '📌 '}
                  {p.title}
                </Link>
                {isNew && (
                  <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                    New
                  </span>
                )}
                {p.visibility === 'unlisted' && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                    Unlisted
                  </span>
                )}
                {p.hasPassword && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                    🔒
                  </span>
                )}
                {expired && (
                  <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-300">
                    Expired
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {p.language} · {formatViews(p.views)} views ·{' '}
                {new Date(p.createdAt).toLocaleDateString()}{' '}
                {p.expiresAt && !expired && (
                  <>· expires {new Date(p.expiresAt).toLocaleString()}</>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <CopyButton text={shareUrl(p.id)} label="Copy link" />
              <button
                onClick={() => togglePin(p.id)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/10"
              >
                {p.pinned ? 'Unpin' : 'Pin'}
              </button>
              {confirmId === p.id ? (
                <>
                  <button
                    onClick={() => remove(p.id)}
                    className="rounded-lg border border-red-500/40 bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/30"
                  >
                    Confirm delete
                  </button>
                  <button
                    onClick={() => setConfirmId(null)}
                    className="text-xs text-zinc-500 hover:text-white"
                  >
                    cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmId(p.id)}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
                >
                  🗑
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
