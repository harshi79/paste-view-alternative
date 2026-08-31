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
      <div className="card animate-pop rounded-xl px-6 py-12 text-center sm:py-14">
        <p className="text-4xl">📭</p>
        <h2 className="mt-4 text-2xl font-black uppercase tracking-tight text-white">No pastes yet, {displayName}</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-400">
          Your dashboard is ready. Create your first paste to start building history, views, and
          shareable links.
        </p>
        <Link href="/paste" className="btn-primary mt-6">
          Create your first paste
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-4">
      {pastes.map((paste) => {
        const expired = paste.expiresAt && new Date(paste.expiresAt).getTime() <= Date.now();
        const isNew = highlightId === paste.id;
        return (
          <article
            key={paste.id}
            className={`card rounded-lg px-4 py-4 transition-all hover:border-[#40404f] sm:px-5 sm:py-5 ${
              isNew
                ? 'border-emerald-400/60 shadow-[5px_5px_0_0_rgba(16,185,129,0.25)]'
                : expired
                  ? 'border-red-500/30 opacity-70'
                  : ''
            } ${busyId === paste.id ? 'animate-pulse' : ''}`}
          >
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/p/${paste.id}`}
                    className="min-w-0 break-words text-base font-bold text-zinc-100 hover:text-white sm:text-lg"
                  >
                    {paste.pinned && '📌 '}
                    {paste.title}
                  </Link>
                  {isNew && (
                    <span className="pill border-emerald-400/30 bg-emerald-500/10 text-emerald-200">
                      New
                    </span>
                  )}
                  {paste.visibility === 'unlisted' && <span className="pill">Unlisted</span>}
                  {paste.hasPassword && <span className="pill">🔒 Protected</span>}
                  {expired && <span className="pill border-red-500/30 bg-red-500/10 text-red-200">Expired</span>}
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
                  <span className="pill">{paste.language}</span>
                  <span className="pill">{formatViews(paste.views)} views</span>
                  <span className="pill">♥ {paste.likesCount.toLocaleString()} likes</span>
                  <span className="pill">Created {new Date(paste.createdAt).toLocaleDateString()}</span>
                  {paste.expiresAt && !expired && (
                    <span className="pill">Expires {new Date(paste.expiresAt).toLocaleString()}</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                <CopyButton text={shareUrl(paste.id)} label="Copy link" />
                <button
                  onClick={() => togglePin(paste.id)}
                  className="btn-ghost !rounded-md !px-3.5 !py-2 text-xs font-bold uppercase tracking-wide"
                >
                  {paste.pinned ? 'Unpin' : 'Pin'}
                </button>
                {confirmId === paste.id ? (
                  <>
                    <button
                      onClick={() => remove(paste.id)}
                      className="btn-danger !rounded-md !px-3.5 !py-2 text-xs uppercase tracking-wide"
                    >
                      Confirm delete
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="btn-ghost !rounded-md !px-3 !py-2 text-xs uppercase tracking-wide"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmId(paste.id)}
                    className="btn-ghost !rounded-md !px-3.5 !py-2 text-xs hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
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
