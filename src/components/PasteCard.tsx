import Link from 'next/link';
import { timeAgo, formatViews } from '@/lib/format';
import Avatar from './Avatar';
import BookmarkButton from './BookmarkButton';
import ReactionBar, { type ReactionCountEntry } from './ReactionBar';

export type PasteCardData = {
  id: string;
  title: string;
  titleColor: string | null;
  language: string;
  views: number;
  likesCount?: number;
  createdAt: Date;
  pinned?: boolean;
  expiresAt?: Date | null;
  preview?: string | null;
  author?: { username: string; displayName: string | null; avatarUrl: string | null } | null;
  reactionCounts?: ReactionCountEntry[];
  mineReaction?: string | null;
  bookmarked?: boolean;
  guest?: boolean;
};

const LANG_COLORS: Record<string, string> = {
  javascript: '#f7df1e',
  typescript: '#3178c6',
  python: '#3776ab',
  java: '#f89820',
  c: '#5b6bbf',
  cpp: '#00599c',
  csharp: '#68217a',
  go: '#00add8',
  rust: '#dea584',
  php: '#777bb3',
  ruby: '#cc342d',
  sql: '#e38c00',
  html: '#e34c26',
  css: '#563d7c',
  json: '#8bc34a',
  yaml: '#cb171e',
  bash: '#4eaa25',
  markdown: '#9e9e9e',
  plaintext: '#71717a',
};

export default function PasteCard({
  paste,
  interactive = false,
}: {
  paste: PasteCardData;
  interactive?: boolean;
}) {
  const dot = LANG_COLORS[paste.language] ?? '#71717a';
  const authorName = paste.author ? paste.author.displayName || paste.author.username : 'Guest';

  return (
    <article
      data-paste-card={paste.id}
      className="card flex min-h-[160px] min-w-0 flex-col gap-3 rounded-lg p-4 sm:p-5"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {paste.author ? (
            <Link
              href={`/u/${paste.author.username}`}
              className="flex min-w-0 items-center gap-2 rounded-md py-0.5 pr-1 text-sm text-zinc-300 transition-colors hover:text-white"
            >
              <Avatar
                value={paste.author.avatarUrl}
                label={authorName}
                className="h-8 w-8 shrink-0"
              />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-zinc-100">{authorName}</span>
                <span className="block truncate font-mono text-[11px] text-zinc-500">
                  @{paste.author.username}
                </span>
              </span>
            </Link>
          ) : paste.author === null ? (
            <span className="flex min-w-0 items-center gap-2 text-sm text-zinc-400">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-black/50 bg-[color:var(--vb-panel-2)] text-xs font-black text-zinc-300">
                G
              </span>
              <span>Guest</span>
            </span>
          ) : (
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Paste</p>
          )}
        </div>
        <time
          className="shrink-0 font-mono text-[11px] font-semibold uppercase tracking-wide text-zinc-500"
          dateTime={paste.createdAt.toISOString()}
        >
          {timeAgo(paste.createdAt)}
        </time>
      </div>

      <Link href={`/p/${paste.id}`} className="group min-w-0">
        <div className="flex items-start justify-between gap-3">
          <h3
            className="min-w-0 break-words text-base font-bold leading-6 text-zinc-100 transition-colors group-hover:text-white sm:text-lg sm:leading-7"
            style={paste.titleColor ? { color: paste.titleColor } : undefined}
          >
            {paste.title}
          </h3>
          {paste.pinned && <span className="pill !py-1 !text-[11px]">📌 Pinned</span>}
        </div>
        {paste.preview ? (
          <p className="mt-2 line-clamp-3 break-words font-mono text-[13px] leading-5 text-zinc-400">
            {paste.preview}
          </p>
        ) : null}
      </Link>

      <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        <span className="pill">
          <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
          {paste.language}
        </span>
        <span className="pill">👁 {formatViews(paste.views)}</span>
        {paste.expiresAt && <span className="pill">⏳ expires</span>}
      </div>

      {interactive && (
        <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-[color:var(--vb-line-soft)] pt-3">
          <ReactionBar
            pasteId={paste.id}
            initialCounts={paste.reactionCounts ?? []}
            initialMine={paste.mineReaction ?? null}
            guest={paste.guest}
          />
          <BookmarkButton
            pasteId={paste.id}
            initialBookmarked={!!paste.bookmarked}
            guest={paste.guest}
          />
        </div>
      )}
    </article>
  );
}
