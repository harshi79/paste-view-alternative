import type { Metadata } from 'next';
import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { pastes } from '@/lib/db/schema';
import { requireUser } from '@/lib/auth';
import { formatViews } from '@/lib/format';
import DashboardList from '@/components/DashboardList';

export const metadata: Metadata = { title: 'My pastes' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { user, profile } = await requireUser();
  const db = await getDb();

  const rows = await db
    .select()
    .from(pastes)
    .where(eq(pastes.userId, user.id))
    .orderBy(desc(pastes.pinned), desc(pastes.createdAt));

  const totalViews = rows.reduce((s, p) => s + p.views, 0);

  return (
    <div className="pt-10">
      <div className="animate-fade-up mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">My pastes</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Everything you&apos;ve pasted — guests can paste too, but only accounts get history.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-2xl border border-white/10 bg-night-800/60 px-5 py-3 text-center">
            <p className="text-2xl font-black text-white">{rows.length}</p>
            <p className="text-xs text-zinc-500">pastes</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-night-800/60 px-5 py-3 text-center">
            <p className="text-2xl font-black text-white">{formatViews(totalViews)}</p>
            <p className="text-xs text-zinc-500">total views</p>
          </div>
          <Link
            href={`/u/${user.username}`}
            className="hidden rounded-2xl border border-white/10 bg-night-800/60 px-5 py-3 text-sm font-semibold text-zinc-200 hover:border-brand-400/40 sm:block"
          >
            View profile →
          </Link>
        </div>
      </div>

      <DashboardList
        pastes={rows.map((p) => ({
          id: p.id,
          title: p.title,
          language: p.language,
          visibility: p.visibility,
          views: p.views,
          pinned: p.pinned,
          hasPassword: !!p.passwordHash,
          expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
          createdAt: p.createdAt.toISOString(),
        }))}
        displayName={profile.displayName || user.username}
      />
    </div>
  );
}
