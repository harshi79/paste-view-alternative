import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { pastes, users, profiles } from '@/lib/db/schema';
import { getSessionUser } from '@/lib/auth';
import { purgeExpired, incrementPasteViews } from '@/lib/pastes';
import { formatViews, timeAgo } from '@/lib/format';
import PasteViewer from '@/components/PasteViewer';
import UnlockForm from '@/components/UnlockForm';
import OwnerActions from '@/components/OwnerActions';
import ExpiryCountdown from '@/components/ExpiryCountdown';
import CopyButton from '@/components/CopyButton';
import Avatar from '@/components/Avatar';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const db = await getDb();
    const [paste] = await db
      .select({ title: pastes.title })
      .from(pastes)
      .where(eq(pastes.id, id))
      .limit(1);
    if (paste) return { title: paste.title };
  } catch {
    /* ignore */
  }
  return { title: 'Paste' };
}

export default async function PastePage({ params }: Props) {
  const { id } = await params;
  const db = await getDb();
  await purgeExpired(db);

  const [paste] = await db.select().from(pastes).where(eq(pastes.id, id)).limit(1);
  if (!paste) notFound();

  const session = await getSessionUser();
  const isOwner = !!session && session.user.id === paste.userId;

  if (paste.expiresAt && paste.expiresAt.getTime() <= Date.now()) {
    return (
      <div className="grid min-h-[55vh] place-items-center pt-16 text-center">
        <div className="animate-pop">
          <p className="text-6xl">⏳</p>
          <h1 className="mt-4 text-2xl font-bold text-white">This paste has expired</h1>
          <p className="mt-2 max-w-md text-zinc-400">
            It was set to self-destruct and has now been removed. Create a new paste anytime —
            it&apos;s free.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-600/30 hover:brightness-110"
          >
            New paste
          </Link>
        </div>
      </div>
    );
  }

  // author info (paste may be a guest paste)
  const authorRow = paste.userId
    ? (
        await db
          .select({
            username: users.username,
            displayName: profiles.displayName,
            avatarUrl: profiles.avatarUrl,
            accent: profiles.accent,
          })
          .from(users)
          .leftJoin(profiles, eq(users.id, profiles.userId))
          .where(eq(users.id, paste.userId))
          .limit(1)
      )[0] ?? null
    : null;

  const locked = !!paste.passwordHash && !isOwner;
  if (!locked) await incrementPasteViews(paste.id);

  const rawUrl = `/p/${paste.id}/raw`;

  return (
    <div className="pt-8">
      {/* header card */}
      <div className="animate-fade-up mb-4 flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/10 bg-night-800/60 p-5 backdrop-blur">
        <div className="min-w-0">
          <h1
            className="break-words text-2xl font-extrabold tracking-tight text-white"
            style={paste.titleColor ? { color: paste.titleColor } : undefined}
          >
            {paste.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-zinc-400">
            {authorRow ? (
              <Link
                href={`/u/${authorRow.username}`}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-0.5 pl-0.5 pr-2.5 text-xs font-medium text-zinc-200 hover:border-brand-400/40"
              >
                <Avatar value={authorRow.avatarUrl} label={authorRow.username} className="h-6 w-6" />
                {authorRow.displayName || authorRow.username}
              </Link>
            ) : (
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs">
                👤 Guest
              </span>
            )}
            <span>{timeAgo(paste.createdAt)}</span>
            <span>👁 {formatViews(paste.views)} views</span>
            {paste.visibility === 'unlisted' && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs">
                Unlisted
              </span>
            )}
            {paste.passwordHash && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs">
                🔒 Protected
              </span>
            )}
            {paste.expiresAt && <ExpiryCountdown expiresAt={paste.expiresAt.toISOString()} />}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!locked && <CopyButton text={paste.content} label="Copy content" />}
          {!locked && (
            <a
              href={rawUrl}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/10"
            >
              Raw
            </a>
          )}
          {!locked && (
            <a
              href={`${rawUrl}?download=1`}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/10"
            >
              Download
            </a>
          )}
          {isOwner && <OwnerActions pasteId={paste.id} pinned={paste.pinned} />}
        </div>
      </div>

      {/* content */}
      {locked ? (
        <UnlockForm pasteId={paste.id} />
      ) : (
        <div className="animate-fade-up" style={{ animationDelay: '60ms' }}>
          <PasteViewer content={paste.content} language={paste.language} />
        </div>
      )}
    </div>
  );
}
