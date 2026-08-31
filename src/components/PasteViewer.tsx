import HighlightedCode from './HighlightedCode';

type Props = { content: string; language: string };

/**
 * Server-rendered, syntax-highlighted viewer for plain-text pastes.
 * - URLs/emails are auto-linked but never previewed.
 * - Line numbers are shown in a gutter.
 * - Highlighting runs on the server, so highlight.js never ships to
 *   the browser on initial page load.
 */
export default function PasteViewer({ content, language }: Props) {
  const lines = content.split('\n');

  return (
    <div className="overflow-hidden rounded-lg border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-inset)] shadow-[6px_6px_0_0_var(--vb-ink)]">
      <div className="flex items-center justify-between gap-3 border-b-2 border-[color:var(--vb-line-soft)] bg-black/30 px-4 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="window-dots" aria-hidden="true">
            <span className="window-dot bg-rose-400/80" />
            <span className="window-dot bg-amber-400/80" />
            <span className="window-dot bg-emerald-400/80" />
          </span>
          <span className="truncate font-mono text-xs font-medium text-zinc-400">{language}</span>
        </div>
        <span className="shrink-0 font-mono text-xs text-zinc-500">
          {lines.length.toLocaleString()} {lines.length === 1 ? 'line' : 'lines'}
        </span>
      </div>

      <div className="flex overflow-x-auto">
        <div
          aria-hidden
          className="shrink-0 select-none border-r-2 border-[color:var(--vb-line-soft)] bg-black/25 px-4 py-4 text-right font-mono text-[12px] leading-6 text-zinc-600"
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <pre className="min-w-0 flex-1 overflow-x-auto px-5 py-4 font-mono text-[13px] leading-6 text-zinc-100">
          <HighlightedCode content={content} language={language} />
        </pre>
      </div>
    </div>
  );
}
