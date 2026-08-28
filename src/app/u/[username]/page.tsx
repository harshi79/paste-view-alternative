import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { pastes, profiles, users } from '@/lib/db/schema';
import { getSessionUser } from '@/lib/auth';
import { computeBadges } from '@/lib/badges';
import { formatDate, formatViews } from '@/lib/format';
import NameDisplay from '@/components/NameDisplay';
import Avatar from '@/components/Avatar';
import PasteCard from '@/components/PasteCard';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function ProfilePage({ params }: Props) {
  const { username } = await params;
  const db = await getDb();

  const [row] = await db
    .select({ user: users, profile: profiles })
    .from(users)
    .leftJoin(profiles, eq(users.id, profiles.userId))
    .where(sql`lower(${users.username}) = ${username.toLowerCase()}`)
    .limit(1);

  if (!row) notFound();

  const user = row.user;
  // profile may be missing if seeded oddly; provide defaults
  const profile = row.profile ?? {
    userId: user.id,
    displayName: null,
    bio: '',
    bioEnabled: true,
    avatarUrl: null,
    bannerUrl: null,
    bannerType: 'image',
    nameFrom: '#a78bfa',
    nameTo: '#22d3ee',
    nameStyle: 'gradient',
    nameEffect: 'none',
    accent: '#8b5cf6',
    links: [],
    views: 0,
  };

  const session = await getSessionUser();
  const isOwner = session?.user.id === user.id;

  // visible pastes: public for everyone; owner also sees unlisted
  const userPastes = await db
    .select()
    .from(pastes)
    .where(
      isOwner
        ? eq(pastes.userId, user.id)
        : and(
            eq(pastes.userId, user.id),
            eq(pastes.visibility, 'public'),
            or(isNull(pastes.expiresAt), sql`${pastes.expiresAt} > now()`),
          ),
    )
    .orderBy(desc(pastes.pinned), desc(pastes.createdAt))
    .limit(50);

  const nowVisible = userPastes.filter(
    (p) => !p.expiresAt || p.expiresAt.getTime() > Date.now(),
  );
  const pinned = nowVisible.filter((p) => p.pinned);
  const rest = nowVisible.filter((p) => !p.pinned);

  if (!isOwner) {
    await db
      .update(profiles)
      .set({ views: sql`${profiles.views} + 1` })
      .where(eq(profiles.userId, user.id));
  }

  const badges = await computeBadges(user, profile, nowVisible);
  const totalViews = nowVisible.reduce((s, p) => s + p.views, 0);

  return (
    <div className="pt-6">
      {/* Banner */}
      <div className="animate-fade-up relative h-44 overflow-hidden rounded-3xl border border-white/10 sm:h-60">
        {profile.bannerUrl && profile.bannerType === 'video' ? (
          <video
            src={profile.bannerUrl}
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-cover"
          />
        ) : profile.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.bannerUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background: `linear-gradient(120deg, ${profile.nameFrom}33, ${profile.accent}55 45%, ${profile.nameTo}33)`,
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-night-950/90 via-night-950/20 to-transparent" />
      </div>

      {/* Identity */}
      <div className="animate-fade-up relative -mt-12 px-1 sm:-mt-14 sm:px-6" style={{ animationDelay: '60ms' }}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-end gap-4">
            <div
              className="rounded-full border-4 shadow-2xl"
              style={{ borderColor: 'var(--color-night-950)', boxShadow: `0 8px 40px ${profile.accent}44` }}
            >
              <Avatar
                value={profile.avatarUrl}
                label={profile.displayName || user.username}
                className="h-24 w-24 sm:h-28 sm:w-28"
              />
            </div>
            <div className="pb-1">
              <h1 className="text-2xl font-black tracking-tight sm:text-4xl">
                <NameDisplay
                  text={profile.displayName || user.username}
                  from={profile.nameFrom}
                  to={profile.nameTo}
                  style={profile.nameStyle as 'solid' | 'gradient'}
                  effect={profile.nameEffect as 'none' | 'typewriter' | 'shimmer' | 'neon' | 'rainbow'}
                />
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                @{user.username} · joined {formatDate(user.createdAt)}
              </p>
            </div>
          </div>

          {isOwner && (
            <Link
              href="/settings"
              className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-brand-600/30 hover:brightness-110"
            >
              🎨 Customize profile
            </Link>
          )}
        </div>

        {/* badges + stats */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {badges.map((b) => (
            <span
              key={b.id}
              className="rounded-full px-3 py-1 text-xs font-bold text-white shadow-md"
              style={{ background: `linear-gradient(100deg, ${b.from}, ${b.to})` }}
              title={b.label}
            >
              {b.emoji} {b.label}
            </span>
          ))}
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300">
            👁 {formatViews(profile.views)} profile views
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300">
            📋 {nowVisible.length} pastes
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300">
            ⚡ {formatViews(totalViews)} paste views
          </span>
        </div>

        {/* bio + links */}
        {profile.bioEnabled && profile.bio && (
          <p className="mt-4 max-w-2xl whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-300">
            {profile.bio}
          </p>
        )}

        {profile.links.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {profile.links.map((l, i) => (
              <a
                key={i}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold transition-transform hover:scale-105"
                style={{
                  borderColor: `${l.color}66`,
                  background: `${l.color}14`,
                  color: l.color,
                }}
              >
                🔗 {l.label}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Pastes */}
      <section className="mt-10">
        {pinned.length > 0 && (
          <>
            <h2 className="mb-4 text-xl font-extrabold text-white">📌 Pinned</h2>
            <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pinned.map((p) => (
                <PasteCard key={p.id} paste={p} />
              ))}
            </div>
          </>
        )}

        <h2 className="mb-4 text-xl font-extrabold text-white">Pastes</h2>
        {rest.length === 0 && pinned.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 p-10 text-center text-zinc-500">
            {isOwner ? (
              <>
                You haven&apos;t created any pastes yet.{' '}
                <Link href="/" className="font-semibold text-brand-300 hover:text-brand-200">
                  Create your first →
                </Link>
              </>
            ) : (
              'No public pastes yet.'
            )}
          </p>
        ) : rest.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing else here yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((p) => (
              <PasteCard key={p.id} paste={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
