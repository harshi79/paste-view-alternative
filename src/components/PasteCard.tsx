import Link from 'next/link';
import { timeAgo, formatViews } from '@/lib/format';

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
  author?: { username: string; displayName: string | null; avatarUrl: string | null } | null;
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

export default function PasteCard({ paste }: { paste: PasteCardData }) {
  const dot = LANG_COLORS[paste.language] ?? '#71717a';

  return (
    <Link
      href={`/p/${paste.id}`}
      className="card group animate-pop flex min-h-[160px] flex-col gap-4 rounded-lg p-4 transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:border-brand-400/50 hover:shadow-[7px_7px_0_0_var(--vb-ink)] sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-500">Paste</p>
          <h3
            className="mt-2 line-clamp-2 break-words text-base font-bold leading-6 text-zinc-100 transition-colors group-hover:text-white sm:text-lg sm:leading-7"
            style={paste.titleColor ? { color: paste.titleColor } : undefined}
          >
            {paste.title}
          </h3>
        </div>
        {paste.pinned && <span className="pill !py-1 !text-[11px]">📌 Pinned</span>}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        <span className="pill">
          <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
          {paste.language}
        </span>
        <span className="pill">👁 {formatViews(paste.views)}</span>
        {!!paste.likesCount && <span className="pill">♥ {paste.likesCount.toLocaleString()}</span>}
        <span className="pill">{timeAgo(paste.createdAt)}</span>
        {paste.expiresAt && <span className="pill">⏳ expires</span>}
        {paste.author && <span className="pill">@{paste.author.username}</span>}
      </div>
    </Link>
  );
}
