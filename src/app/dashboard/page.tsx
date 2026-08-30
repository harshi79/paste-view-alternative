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

type Props = { searchParams: Promise<{ created?: string }> };

export default async function DashboardPage({ searchParams }: Props) {
  const { user, profile } = await requireUser();
  const db = await getDb();

  const { created } = await searchParams;

  const rows = await db
    .select()
    .from(pastes)
    .where(eq(pastes.userId, user.id))
    .orderBy(desc(pastes.pinned), desc(pastes.createdAt));

  const totalViews = rows.reduce((s, p) => s + p.views, 0);
  const totalLikes = rows.reduce((s, p) => s + (p.likesCount ?? 0), 0);

  return (
    <div className="pt-4 sm:pt-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="card animate-fade-up rounded-[28px] px-5 py-5 sm:px-6 sm:py-6">
          <p className="eyebrow">Dashboard</p>
          <h1 className="mt-4 text-2xl font-black tracking-tight text-white sm:text-4xl">
            Your paste workspace
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
            Review every paste you&apos;ve created, copy links quickly, and keep important ones pinned.
            The underlying routes and sharing behavior stay exactly the same.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link href="/paste" className="btn-primary">
              Create new paste
            </Link>
            <Link href={`/u/${user.username}`} className="btn-ghost">
              View public profile
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <div className="stat-card p-5 text-center xl:text-left">
            <p className="text-3xl font-black text-white">{rows.length}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Total pastes
            </p>
          </div>
          <div className="stat-card p-5 text-center xl:text-left">
            <p className="text-3xl font-black text-white">{formatViews(totalViews)}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Combined views
            </p>
          </div>
          <div className="stat-card p-5 text-center xl:text-left">
            <p className="text-3xl font-black text-white">♥ {formatViews(totalLikes)}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Combined likes
            </p>
          </div>
        </div>
      </section>

      {created && rows.find((r) => r.id === created) && (
        <div className="feedback-success animate-pop mt-5 rounded-[24px] px-5 py-4">
          <p className="font-semibold">Paste created successfully.</p>
          <p className="mt-1 text-emerald-300/80">
            Use the copy button on the newly highlighted row below to share it. The link still never
            appears here as plain text.
          </p>
        </div>
      )}

      <section className="mt-6">
        <DashboardList
          pastes={rows.map((p) => ({
            id: p.id,
            title: p.title,
            language: p.language,
            visibility: p.visibility,
            views: p.views,
            likesCount: p.likesCount ?? 0,
            pinned: p.pinned,
            hasPassword: !!p.passwordHash,
            expiresAt: p.expiresAt ? p.expiresAt.toISOString() : null,
            createdAt: p.createdAt.toISOString(),
          }))}
          displayName={profile.displayName || user.username}
          highlightId={created ?? null}
        />
      </section>
    </div>
  );
}
