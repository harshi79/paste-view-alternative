'use client';

import { useMemo } from 'react';
import hljs from 'highlight.js/lib/common';
import { hljsLanguage } from '@/lib/languages';

type Props = { content: string; language: string };

/** Syntax-highlighted code viewer with line numbers. */
export default function PasteViewer({ content, language }: Props) {
  const lines = useMemo(() => content.split('\n'), [content]);

  const highlighted = useMemo(() => {
    const lang = hljsLanguage(language);
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(content, { language: lang, ignoreIllegals: true }).value;
      }
    } catch {
      /* fall through to plain */
    }
    return null;
  }, [content, language]);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-night-900/80">
      <div className="flex overflow-x-auto">
        {/* line-number gutter */}
        <div
          aria-hidden
          className="select-none border-r border-white/5 bg-black/20 px-3 py-4 text-right font-mono text-[13px] leading-6 text-zinc-600"
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        {/* code */}
        <pre
          className="flex-1 overflow-x-auto px-4 py-4 font-mono text-[13px] leading-6"
        >
          {highlighted ? (
            <code className="hljs" dangerouslySetInnerHTML={{ __html: highlighted }} />
          ) : (
            <code className="hljs">{content}</code>
          )}
        </pre>
      </div>
    </div>
  );
}
