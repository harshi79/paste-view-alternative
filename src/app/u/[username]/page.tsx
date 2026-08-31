import Link from 'next/link';
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { pastes, profiles, users } from '@/lib/db/schema';
import { getSessionUser, getUserTags, isAdmin } from '@/lib/auth';
import { computeBadges } from '@/lib/badges';
import { formatDate, formatViews } from '@/lib/format';
import NameDisplay from '@/components/NameDisplay';
import { sanitizeNameEffect } from '@/lib/nameEffects';
import Avatar from '@/components/Avatar';
import SafeImage from '@/components/SafeImage';
import PasteCard from '@/components/PasteCard';
import SocialPlatformIcon from '@/components/SocialPlatformIcon';
import { detectSocialPlatform } from '@/lib/socialPlatform';
import AdminTags from '@/components/AdminTags';
import TagBadge from '@/components/TagBadge';
import EmojiStatus from '@/components/EmojiStatus';
import FollowButton from '@/components/FollowButton';
import FollowStats from '@/components/FollowStats';
import { loadStickerByToken } from '@/lib/stickerPack.server';
import { getFollowCounts, isFollowingUser } from '@/lib/follows';

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
    effectSpeed: 50,
    effectIntensity: 60,
    accent: '#8b5cf6',
    links: [],
    views: 0,
    statusEmoji: '',
    statusText: '',
  };

  const [session, adminStatus, userTags, userPastes, statusSticker, followCounts] = await Promise.all([
    getSessionUser(),
    isAdmin(),
    getUserTags(user.id),
    db
      .select()
      .from(pastes)
      .where(eq(pastes.userId, user.id))
      .orderBy(desc(pastes.pinned), desc(pastes.createdAt))
      .limit(100),
    loadStickerByToken(profile.statusEmoji, db),
    getFollowCounts(user.id),
  ]);

  const isOwner = session?.user.id === user.id;
  const isFollowing =
    session && !isOwner ? await isFollowingUser(session.user.id, user.id) : false;

  const nowVisible = userPastes.filter(
    (paste) =>
      (!paste.expiresAt || paste.expiresAt.getTime() > Date.now()) &&
      (isOwner || paste.visibility === 'public'),
  );
  const pinned = nowVisible.filter((paste) => paste.pinned);
  const rest = nowVisible.filter((paste) => !paste.pinned);

  const [, badges] = await Promise.all([
    isOwner
      ? Promise.resolve()
      : db
          .update(profiles)
          .set({ views: sql`${profiles.views} + 1` })
          .where(eq(profiles.userId, user.id)),
    computeBadges(user, profile, nowVisible),
  ]);

  const totalViews = nowVisible.reduce((s, paste) => s + paste.views, 0);
  const totalLikes = nowVisible.reduce((s, paste) => s + (paste.likesCount ?? 0), 0);

  // Presentation-only variables for the banner fallback (see
  // .profile-banner-fallback in globals.css).
  const bannerVars = {
    '--pf-from': profile.nameFrom,
    '--pf-accent': profile.accent,
    '--pf-to': profile.nameTo,
  } as CSSProperties;

  return (
    <div className="pt-4 sm:pt-6">
      {/* Profile hero — banner, identity, stats, bio and links composed as
          ONE panel so the header reads as a single deliberate unit instead
          of floating chips over the page background. */}
      <section className="card animate-fade-up overflow-hidden rounded-xl">
        {/* Banner — the fallback gradient is the base layer, so a broken or
            missing image URL degrades to the profile's own colors. */}
        <div className="profile-banner-fallback relative h-32 sm:h-44 lg:h-52" style={bannerVars}>
          {profile.bannerUrl && profile.bannerType === 'video' ? (
            <video
              src={profile.bannerUrl}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : profile.bannerUrl ? (
            <SafeImage src={profile.bannerUrl} className="absolute inset-0 h-full w-full object-cover" />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-night-950/95 via-night-950/30 to-transparent" />
        </div>

        <div className="px-4 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
          {/* Identity row: avatar overlaps the banner by a fixed amount while
              the text block always starts below the banner edge, so long
              names/tags/statuses never sit on top of busy banner media. */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
              <div className="-mt-12 w-fit shrink-0 rounded-xl border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-panel)] p-1 shadow-[5px_5px_0_0_var(--vb-ink)] sm:-mt-14 lg:-mt-16">
                <Avatar
                  value={profile.avatarUrl}
                  label={profile.displayName || user.username}
                  className="h-20 w-20 sm:h-24 sm:w-24 lg:h-28 lg:w-28"
                />
              </div>
              <div className="min-w-0 pt-0.5">
                {/* One logical row: display name → title/tag → EmojiStatus.
                    Every child is an inline-flex with items-center so the
                    unicode status and the animated sticker/GIF status share
                    the exact same vertically-centered slot. */}
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                  <h1 className="inline-flex min-w-0 max-w-full items-center break-words text-2xl font-black uppercase leading-[1.05] tracking-tight sm:text-4xl lg:text-5xl">
                    <NameDisplay
                      text={profile.displayName || user.username}
                      from={profile.nameFrom}
                      to={profile.nameTo}
                      style={profile.nameStyle as 'solid' | 'gradient'}
                      effect={sanitizeNameEffect(profile.nameEffect)}
                      speed={profile.effectSpeed}
                      intensity={profile.effectIntensity}
                    />
                  </h1>
                  {userTags.length > 0 && (
                    <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
                      {userTags.map((tag) => (
                        <TagBadge
                          key={tag.id}
                          label={tag.label}
                          color={tag.color}
                          effect={tag.effect}
                          size="sm"
                        />
                      ))}
                    </span>
                  )}
                  {/* Status emoji/GIF sits after the display name + title badges. */}
                  <EmojiStatus
                    value={profile.statusEmoji}
                    pack={statusSticker ? [statusSticker] : undefined}
                    className="inline-flex shrink-0 items-center text-xl leading-none sm:text-2xl lg:text-3xl"
                    title={profile.statusText || 'Status'}
                  />
                </div>
                {/* Second line: username · joined date · text status */}
                <p className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] leading-5 text-zinc-400 sm:text-xs">
                  <span className="break-all font-bold text-zinc-300">@{user.username}</span>
                  <span aria-hidden className="text-zinc-600">·</span>
                  <span>joined {formatDate(user.createdAt)}</span>
                  {profile.statusText ? (
                    <>
                      <span aria-hidden className="text-zinc-600">·</span>
                      <span className="min-w-0 break-words text-zinc-400">{profile.statusText}</span>
                    </>
                  ) : null}
                </p>
                {badges.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {badges.map((badge) => (
                      <span
                        key={badge.id}
                        className="profile-badge"
                        style={{ background: `linear-gradient(100deg, ${badge.from}, ${badge.to})` }}
                        title={badge.label}
                      >
                        {badge.emoji} {badge.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {!isOwner && (
              <div className="w-full shrink-0 sm:w-auto sm:self-start [&_button]:w-full sm:[&_button]:w-auto">
                <FollowButton
                  username={user.username}
                  initialFollowing={isFollowing}
                  guest={!session}
                />
              </div>
            )}
          </div>

          {/* Stat rail — follow counts (interactive) and paste/profile
              numbers (static) share one tile system. */}
          <div className="mt-5 flex flex-wrap items-stretch gap-2 border-t border-[color:var(--vb-line-soft)] pt-4 sm:gap-2.5">
            <FollowStats
              username={user.username}
              followersCount={followCounts.followers}
              followingCount={followCounts.following}
              guest={!session}
            />
            <span className="profile-stat" title="Public pastes">
              <span className="profile-stat__num">{nowVisible.length.toLocaleString()}</span>
              <span className="profile-stat__label">{nowVisible.length === 1 ? 'paste' : 'pastes'}</span>
            </span>
            <span className="profile-stat" title="Total paste views">
              <span className="profile-stat__num">{formatViews(totalViews)}</span>
              <span className="profile-stat__label">paste views</span>
            </span>
            <span className="profile-stat" title="Total paste likes">
              <span className="profile-stat__num">{formatViews(totalLikes)}</span>
              <span className="profile-stat__label">likes</span>
            </span>
            <span className="profile-stat" title="Profile views">
              <span className="profile-stat__num">{formatViews(profile.views)}</span>
              <span className="profile-stat__label">profile views</span>
            </span>
          </div>

          {profile.bioEnabled && profile.bio && (
            <p
              className="mt-5 max-w-3xl whitespace-pre-wrap border-l-4 pl-4 text-sm leading-7 text-zinc-300 sm:text-[15px]"
              style={{ borderColor: `${profile.accent}cc` }}
            >
              {profile.bio}
            </p>
          )}

          {profile.links.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 sm:gap-2.5">
              {profile.links.map((link, i) => {
                const detected = detectSocialPlatform(link.url);
                const label = (link.label ?? '').trim() || detected.label;
                const accent = detected.color;
                return (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="profile-link"
                    style={{ '--link-accent': accent } as CSSProperties}
                  >
                    <span className="profile-link__icon">
                      <SocialPlatformIcon platform={detected.icon} className="h-4 w-4" />
                    </span>
                    <span className="profile-link__label">{label}</span>
                    <span className="profile-link__arrow" aria-hidden>
                      ↗
                    </span>
                  </a>
                );
              })}
            </div>
          )}

          {adminStatus && !isOwner && (
            <AdminTags userId={user.id} initialTagIds={userTags.map((tag) => tag.id)} />
          )}
        </div>
      </section>

      <section className="animate-fade-up mt-8 sm:mt-10" style={{ animationDelay: '60ms' }}>
        {pinned.length > 0 && (
          <div className="mb-8 sm:mb-10">
            <header className="mb-4 flex items-center gap-3">
              <h2 className="text-lg font-black uppercase tracking-tight text-white sm:text-xl">Pinned</h2>
              <span className="profile-count">{pinned.length}</span>
              <span
                aria-hidden
                className="h-[2px] min-w-8 flex-1 rounded-full bg-gradient-to-r from-brand-500/50 to-transparent"
              />
            </header>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pinned.map((paste) => (
                <PasteCard key={paste.id} paste={paste} />
              ))}
            </div>
          </div>
        )}

        <header className="mb-4 flex items-center gap-3">
          <h2 className="text-lg font-black uppercase tracking-tight text-white sm:text-xl">Pastes</h2>
          <span className="profile-count">{nowVisible.length}</span>
          <span
            aria-hidden
            className="h-[2px] min-w-8 flex-1 rounded-full bg-gradient-to-r from-brand-500/50 to-transparent"
          />
        </header>
        {rest.length === 0 && pinned.length === 0 ? (
          <div className="card flex flex-col items-center gap-2.5 rounded-lg px-6 py-10 text-center sm:px-8 sm:py-12">
            <span
              aria-hidden
              className="grid h-11 w-11 place-items-center rounded-md border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] text-lg shadow-[3px_3px_0_0_var(--vb-ink)]"
            >
              📋
            </span>
            <p className="text-sm font-bold text-zinc-200">
              {isOwner ? 'No pastes yet' : 'No public pastes yet'}
            </p>
            <p className="max-w-sm text-sm leading-6 text-zinc-500">
              {isOwner ? (
                <>
                  You haven&apos;t created any pastes yet —{' '}
                  <Link href="/paste" className="font-semibold text-brand-300 underline-offset-2 hover:text-brand-200 hover:underline">
                    create your first
                  </Link>{' '}
                  and it will show up here.
                </>
              ) : (
                'This profile is still waiting for its first public paste.'
              )}
            </p>
          </div>
        ) : rest.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[color:var(--vb-line)] px-4 py-3 text-sm text-zinc-500">
            Nothing else here yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((paste) => (
              <PasteCard key={paste.id} paste={paste} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
