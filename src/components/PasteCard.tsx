import Link from 'next/link';
import { timeAgo, formatViews } from '@/lib/format';

export type PasteCardData = {
  id: string;
  title: string;
  titleColor: string | null;
  language: string;
  views: number;
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
      className="card group animate-pop flex flex-col gap-2 p-4 transition-all hover:-translate-y-0.5 hover:border-brand-400/40 hover:shadow-lg hover:shadow-brand-600/10"
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          className="line-clamp-1 font-semibold text-zinc-100 transition-colors group-hover:text-white"
          style={paste.titleColor ? { color: paste.titleColor } : undefined}
        >
          {paste.title}
        </h3>
        {paste.pinned && <span title="Pinned">📌</span>}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
          {paste.language}
        </span>
        <span>👁 {formatViews(paste.views)}</span>
        <span>{timeAgo(paste.createdAt)}</span>
        {paste.expiresAt && <span title="Expires">⏳ expires</span>}
        {paste.author && (
          <span className="ml-auto truncate text-brand-300/80">@{paste.author.username}</span>
        )}
      </div>
    </Link>
  );
}
