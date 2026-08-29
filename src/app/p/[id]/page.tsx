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
import { parsePasteContent, isRichDoc } from '@/lib/pasteFormat';
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

  // Paste lookup, lazy expiry purge, and session lookup are independent —
  // run them in parallel instead of three sequential round-trips.
  const [[paste], , session] = await Promise.all([
    db.select().from(pastes).where(eq(pastes.id, id)).limit(1),
    purgeExpired(db),
    getSessionUser(),
  ]);
  if (!paste) notFound();

  const isOwner = !!session && session.user.id === paste.userId;

  if (paste.expiresAt && paste.expiresAt.getTime() <= Date.now()) {
    return (
      <div className="grid min-h-[55vh] place-items-center pt-16 text-center">
        <div className="animate-pop">
          <p className="text-6xl">⏳</p>
          <h1 className="mt-4 text-2xl font-bold text-white">This paste has expired</h1>
          <p className="mt-2 max-w-md text-zinc-400">
            It was set to self-destruct and has now been removed. Create a new paste any time.
          </p>
          <Link
            href="/"
            className="btn-primary mt-6 px-6 py-2.5 text-sm font-bold"
          >
            New paste
          </Link>
        </div>
      </div>
    );
  }

  const locked = !!paste.passwordHash && !isOwner;

  // Author lookup, view increment, sticker pack and the like state are
  // independent — run them concurrently (one DB round-trip window).
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
      // Paste row is already loaded above — pass its counter to avoid a
      // duplicate read; only the "did I like it" lookup runs.
      return getLikeState(paste.id, likeActor(session?.user.id, ip), paste.likesCount ?? 0);
    })(),
  ]);
  const authorRow = authorRows[0] ?? null;

  const rawUrl = `/p/${paste.id}/raw`;
  const isRich = paste.format === 'rich';
  const parsed = parsePasteContent(paste.format, paste.content);

  return (
    <div className="pt-8">
      <div className="card animate-fade-up mb-4 flex flex-wrap items-start justify-between gap-4 p-5">
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
              <span className="chip">
                Guest
              </span>
            )}
            <span>{timeAgo(paste.createdAt)}</span>
            <span>{formatViews(paste.views)} views</span>
            {paste.visibility === 'unlisted' && (
              <span className="chip">
                Unlisted
              </span>
            )}
            {paste.passwordHash && (
              <span className="chip">
                🔒 Protected
              </span>
            )}
            {isRich && (
              <span className="chip">
                Rich
              </span>
            )}
            {paste.expiresAt && <ExpiryCountdown expiresAt={paste.expiresAt.toISOString()} />}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <LikeButton pasteId={paste.id} initialCount={likeState.count} initialLiked={likeState.liked} />
          <CopyLinkButton id={paste.id} />
          {!locked && isRich && isRichDoc(parsed) && (
            <CopyButton text={extractPlainText(parsed)} label="Copy content" />
          )}
          {!locked && !isRich && <CopyButton text={paste.content} label="Copy content" />}
          {!locked && (
            <a
              href={rawUrl}
              className="btn-ghost px-3 py-1.5 text-xs font-semibold"
            >
              Raw
            </a>
          )}
          {!locked && (
            <a
              href={`${rawUrl}?download=1`}
              className="btn-ghost px-3 py-1.5 text-xs font-semibold"
            >
              Download
            </a>
          )}
          {isOwner && <OwnerActions pasteId={paste.id} pinned={paste.pinned} />}
        </div>
      </div>

      {locked ? (
        <UnlockForm pasteId={paste.id} />
      ) : isRich && isRichDoc(parsed) ? (
        <div className="animate-fade-up" style={{ animationDelay: '60ms' }}>
          <RichPasteView doc={parsed} stickers={stickerRows} />
        </div>
      ) : (
        <div className="animate-fade-up" style={{ animationDelay: '60ms' }}>
          <PasteViewer content={paste.content} language={paste.language} />
        </div>
      )}
    </div>
  );
}

function extractPlainText(doc: { lines: { text: string }[] }): string {
  return doc.lines
    .map((l) => {
      // strip sticker/emoji replacement tokens from raw text
      return l.text;
    })
    .join('\n');
}
