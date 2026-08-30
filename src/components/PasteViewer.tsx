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
    <div className="overflow-hidden rounded-[26px] border border-white/10 bg-[#060912]/85 shadow-[0_28px_60px_-40px_rgba(0,0,0,0.92)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-black/20 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="window-dots" aria-hidden="true">
            <span className="window-dot bg-rose-400/80" />
            <span className="window-dot bg-amber-400/80" />
            <span className="window-dot bg-emerald-400/80" />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">Source view</p>
            <p className="text-[11px] text-zinc-500">Syntax highlighted, line-numbered, and safe to copy.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400">
          <span className="pill">{language}</span>
          <span className="pill">{lines.length.toLocaleString()} lines</span>
        </div>
      </div>

      <div className="flex overflow-x-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.015),transparent_30%)]">
        <div
          aria-hidden
          className="select-none border-r border-white/6 bg-black/20 px-4 py-5 text-right font-mono text-[12px] leading-6 text-zinc-600"
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <pre className="flex-1 overflow-x-auto px-5 py-5 font-mono text-[13px] leading-6 text-zinc-100">
          <HighlightedCode content={content} language={language} />
        </pre>
      </div>
    </div>
  );
}
