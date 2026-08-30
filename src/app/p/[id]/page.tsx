import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { pastes, users, profiles, stickers } from '@/lib/db/schema';
import { getSessionUser } from '@/lib/auth';
import { getClientIp } from '@/lib/ip';
import { getLikeState, likeActor } from '@/lib/likes';
import { purgeExpired, incrementPasteViews } from '@/lib/pastes';
import { formatViews, timeAgo } from '@/lib/format';
import {
  parsePasteContent,
  isRichDoc,
  hasRichFormatting,
  richDocToPlainText,
} from '@/lib/pasteFormat';
import PasteViewer from '@/components/PasteViewer';
import RichPasteView from '@/components/RichPasteView';
import UnlockForm from '@/components/UnlockForm';
import OwnerActions from '@/components/OwnerActions';
import ExpiryCountdown from '@/components/ExpiryCountdown';
import CopyButton from '@/components/CopyButton';
import CopyLinkButton from '@/components/CopyLinkButton';
import Avatar from '@/components/Avatar';
import LikeButton from '@/components/LikeButton';

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

  const [[paste], , session] = await Promise.all([
    db.select().from(pastes).where(eq(pastes.id, id)).limit(1),
    purgeExpired(db),
    getSessionUser(),
  ]);
  if (!paste) notFound();

  const isOwner = !!session && session.user.id === paste.userId;

  if (!isOwner && !paste.passwordHash) {
    await incrementPasteViews(paste.id);
    const [[updated]] = await Promise.all([db.select().from(pastes).where(eq(pastes.id, id)).limit(1)]);
    if (updated) paste.views = updated.views;
  }

  if (paste.expiresAt && paste.expiresAt.getTime() <= Date.now()) {
    return (
      <div className="grid min-h-[50vh] place-items-center pt-8 text-center">
        <div className="card animate-pop max-w-md rounded-[24px] p-6 text-center sm:p-8">
          <p className="text-4xl">⏳</p>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">This paste has expired</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            This paste was set to expire and is no longer available.
          </p>
          <Link href="/paste" className="btn-primary mt-6 px-5 py-2.5 text-sm font-semibold">
            Create new paste
          </Link>
        </div>
      </div>
    );
  }

  const locked = !!paste.passwordHash && !isOwner;

  const [authorRows, stickerRows, likeState] = await Promise.all([
    paste.userId
      ? db
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
      : Promise.resolve([]),
    locked
      ? Promise.resolve([])
      : db
          .select({
            token: stickers.token,
            url: stickers.url,
            emoji: stickers.emoji,
            label: stickers.label,
          })
          .from(stickers),
    (async () => {
      const ip = await getClientIp();
      return getLikeState(paste.id, likeActor(session?.user.id, ip), paste.likesCount ?? 0);
    })(),
  ]);
  const authorRow = authorRows[0] ?? null;

  const rawUrl = `/p/${paste.id}/raw`;
  const isRich = paste.format === 'rich';
  const parsed = parsePasteContent(paste.format, paste.content);
  const richDoc = isRichDoc(parsed) ? parsed : null;

  return (
    <div className="animate-fade-up pb-8 pt-2 sm:pt-4">
      <div className="mb-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div className="min-w-0">
          <h1
            className="break-words text-2xl font-black tracking-tight text-white sm:text-3xl lg:text-4xl"
            style={paste.titleColor ? { color: paste.titleColor } : undefined}
          >
            {paste.title}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400 sm:text-sm">
            {authorRow ? (
              <Link
                href={`/u/${authorRow.username}`}
                className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3 text-xs font-semibold text-zinc-200 transition-colors hover:border-brand-400/40 hover:bg-white/[0.08]"
              >
                <Avatar value={authorRow.avatarUrl} label={authorRow.username} className="h-5 w-5 sm:h-6 sm:w-6" />
                <span className="truncate">{authorRow.displayName || authorRow.username}</span>
              </Link>
            ) : (
              <span className="pill !py-1 !text-xs">Guest author</span>
            )}
            <span className="pill !py-1 !text-xs">{timeAgo(paste.createdAt)}</span>
            <span className="pill !py-1 !text-xs">{formatViews(paste.views)} views</span>
            {paste.visibility === 'unlisted' && <span className="pill !py-1 !text-xs">Unlisted</span>}
            {paste.passwordHash && <span className="pill !py-1 !text-xs">🔒 Protected</span>}
            {!!richDoc && hasRichFormatting(richDoc) && (
              <span className="pill !py-1 !text-xs">Rich formatting</span>
            )}
            {paste.expiresAt && <ExpiryCountdown expiresAt={paste.expiresAt.toISOString()} />}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <LikeButton pasteId={paste.id} initialCount={likeState.count} initialLiked={likeState.liked} />
          <CopyLinkButton id={paste.id} />
          {!locked && richDoc && <CopyButton text={richDocToPlainText(richDoc)} label="Copy content" />}
          {!locked && !isRich && <CopyButton text={paste.content} label="Copy content" />}
          {!locked && (
            <a href={rawUrl} className="btn-ghost !rounded-xl !px-3.5 !py-2 text-xs font-semibold">
              Raw view
            </a>
          )}
          {!locked && (
            <a href={`${rawUrl}?download=1`} className="btn-ghost !rounded-xl !px-3.5 !py-2 text-xs font-semibold">
              Download
            </a>
          )}
          {isOwner && <OwnerActions pasteId={paste.id} pinned={paste.pinned} />}
        </div>
      </div>

      <div>
        {locked ? (
          <UnlockForm pasteId={paste.id} />
        ) : richDoc ? (
          <RichPasteView doc={richDoc} stickers={stickerRows} />
        ) : (
          <PasteViewer content={paste.content} language={paste.language} />
        )}
      </div>
    </div>
  );
}
