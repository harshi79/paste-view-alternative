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
  likesCount: number;
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
      <div className="card animate-pop rounded-[28px] px-6 py-14 text-center">
        <p className="text-5xl">📭</p>
        <h2 className="mt-4 text-2xl font-bold text-white">No pastes yet, {displayName}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Your dashboard is ready. Create your first paste to start building history, views, and
          shareable links.
        </p>
        <Link href="/" className="btn-primary mt-6">
          Create your first paste
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-4">
      {pastes.map((p) => {
        const expired = p.expiresAt && new Date(p.expiresAt).getTime() <= Date.now();
        const isNew = highlightId === p.id;
        return (
          <article
            key={p.id}
            className={`card rounded-[26px] px-5 py-5 transition-all ${
              isNew
                ? 'border-emerald-400/35 shadow-[0_24px_60px_-42px_rgba(16,185,129,0.7)]'
                : expired
                  ? 'border-red-500/20 opacity-70'
                  : 'hover:border-white/20'
            } ${busyId === p.id ? 'animate-pulse' : ''}`}
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/p/${p.id}`} className="truncate text-lg font-semibold text-zinc-100 hover:text-white">
                    {p.pinned && '📌 '}
                    {p.title}
                  </Link>
                  {isNew && (
                    <span className="pill border-emerald-400/30 bg-emerald-500/10 text-emerald-200">New</span>
                  )}
                  {p.visibility === 'unlisted' && <span className="pill">Unlisted</span>}
                  {p.hasPassword && <span className="pill">🔒 Protected</span>}
                  {expired && <span className="pill border-red-500/30 bg-red-500/10 text-red-200">Expired</span>}
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                  <span className="pill">{p.language}</span>
                  <span className="pill">{formatViews(p.views)} views</span>
                  <span className="pill">♥ {p.likesCount.toLocaleString()} likes</span>
                  <span className="pill">Created {new Date(p.createdAt).toLocaleDateString()}</span>
                  {p.expiresAt && !expired && (
                    <span className="pill">Expires {new Date(p.expiresAt).toLocaleString()}</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                <CopyButton text={shareUrl(p.id)} label="Copy link" />
                <button onClick={() => togglePin(p.id)} className="btn-ghost !px-3.5 !py-2 text-xs font-semibold">
                  {p.pinned ? 'Unpin' : 'Pin'}
                </button>
                {confirmId === p.id ? (
                  <>
                    <button
                      onClick={() => remove(p.id)}
                      className="rounded-xl border border-red-500/40 bg-red-500/20 px-3.5 py-2 text-xs font-semibold text-red-200 transition-colors hover:bg-red-500/30"
                    >
                      Confirm delete
                    </button>
                    <button onClick={() => setConfirmId(null)} className="btn-ghost !px-3 !py-2 text-xs">
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmId(p.id)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-zinc-200 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
