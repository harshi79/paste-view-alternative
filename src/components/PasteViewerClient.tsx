'use client';

import HighlightedCode from './HighlightedCode';

type Props = { content: string; language: string };

/**
 * Client-side paste viewer for password-protected pastes: the content is
 * only fetched after the user unlocks it, so this module (and the
 * highlight.js code it pulls in via `HighlightedCode`) is loaded lazily
 * at that point — never on the initial paste page.
 */
export default function PasteViewerClient({ content, language }: Props) {
  const lines = content.split('\n');

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-night-900/80">
      <div className="flex overflow-x-auto">
        <div
          aria-hidden
          className="select-none border-r border-white/5 bg-black/20 px-3 py-4 text-right font-mono text-[13px] leading-6 text-zinc-600"
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <pre className="flex-1 overflow-x-auto px-4 py-4 font-mono text-[13px] leading-6">
          <HighlightedCode content={content} language={language} />
        </pre>
      </div>
    </div>
  );
}
