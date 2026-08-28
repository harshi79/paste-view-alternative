'use client';

import { useMemo } from 'react';
import hljs from 'highlight.js/lib/common';
import { hljsLanguage } from '@/lib/languages';
import { detectLinks } from '@/lib/pasteFormat';

type Props = { content: string; language: string };

/**
 * Syntax-highlighted viewer for plain-text pastes.
 * - URLs/emails are auto-linked but never previewed.
 * - Line numbers are shown in a gutter.
 */
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
        <div
          aria-hidden
          className="select-none border-r border-white/5 bg-black/20 px-3 py-4 text-right font-mono text-[13px] leading-6 text-zinc-600"
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <pre className="flex-1 overflow-x-auto px-4 py-4 font-mono text-[13px] leading-6">
          {highlighted ? (
            <AutoLinkedHtml html={highlighted} />
          ) : (
            <AutoLinkedText text={content} />
          )}
        </pre>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Auto-link helpers. We render either pre-highlighted HTML (with
// embedded <span class="hljs-…">) or plain text; in both cases we
// post-process the resulting text to wrap URLs in <a> tags.
// ------------------------------------------------------------------

function AutoLinkedText({ text }: { text: string }) {
  return (
    <code className="hljs whitespace-pre">
      {renderWithLinks(text)}
    </code>
  );
}

function AutoLinkedHtml({ html }: { html: string }) {
  // hljs's output is a tree of <span>s with text leaves. We can't
  // naively splice <a> tags into it (would break the spans), so we
  // post-process the rendered DOM in an effect. The simpler path:
  // walk through and replace text node contents.
  const segments = useMemo(() => hljsSegmentsWithLinks(html), [html]);
  return (
    <code className="hljs">
      {segments.map((seg, i) =>
        seg.kind === 'html' ? (
          <span key={i} dangerouslySetInnerHTML={{ __html: seg.value }} />
        ) : (
          renderLinkSegments(seg.value, `${i}-`)
        ),
      )}
    </code>
  );
}

type Segment = { kind: 'html'; value: string } | { kind: 'text'; value: string };

/**
 * Splits an hljs string into "<span …>...</span>" pieces and bare
 * text pieces, preserving the spans. Bare text gets linkified.
 */
function hljsSegmentsWithLinks(html: string): Segment[] {
  const out: Segment[] = [];
  let i = 0;
  while (i < html.length) {
    const next = html.indexOf('<', i);
    if (next === -1) {
      out.push({ kind: 'text', value: html.slice(i) });
      break;
    }
    if (next > i) {
      out.push({ kind: 'text', value: html.slice(i, next) });
    }
    const close = html.indexOf('>', next);
    if (close === -1) {
      out.push({ kind: 'html', value: html.slice(next) });
      break;
    }
    // We only handle <span…>…</span> blocks; everything else
    // (rare) we pass through as html.
    const openTag = html.slice(next, close + 1);
    if (openTag.startsWith('<span')) {
      // find matching </span>
      const closingIdx = html.indexOf('</span>', close);
      if (closingIdx === -1) {
        out.push({ kind: 'html', value: html.slice(next) });
        break;
      }
      const inner = html.slice(close + 1, closingIdx);
      out.push({
        kind: 'html',
        value: `${openTag}${inner}</span>`,
      });
      i = closingIdx + 7;
    } else {
      // self-closing / other tag — pass through to next
      const tagEnd = html.indexOf('>', close);
      out.push({ kind: 'html', value: html.slice(next, tagEnd + 1) });
      i = tagEnd + 1;
    }
  }
  return out;
}

function renderWithLinks(text: string): React.ReactNode[] {
  const links = detectLinks(text);
  if (links.length === 0) return [text];
  const out: React.ReactNode[] = [];
  let cursor = 0;
  links.forEach((m, i) => {
    if (m.start > cursor) out.push(text.slice(cursor, m.start));
    out.push(
      <a
        key={i}
        href={m.value}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-brand-300 underline decoration-brand-500/40 underline-offset-2 hover:text-brand-200"
      >
        {text.slice(m.start, m.end)}
      </a>,
    );
    cursor = m.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

function renderLinkSegments(text: string, keyPrefix: string): React.ReactNode[] {
  const links = detectLinks(text);
  if (links.length === 0) return [<span key={keyPrefix + '0'}>{text}</span>];
  const out: React.ReactNode[] = [];
  let cursor = 0;
  links.forEach((m, i) => {
    if (m.start > cursor) out.push(<span key={keyPrefix + 't' + i}>{text.slice(cursor, m.start)}</span>);
    out.push(
      <a
        key={keyPrefix + 'l' + i}
        href={m.value}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-brand-300 underline decoration-brand-500/40 underline-offset-2 hover:text-brand-200"
      >
        {text.slice(m.start, m.end)}
      </a>,
    );
    cursor = m.end;
  });
  if (cursor < text.length) out.push(<span key={keyPrefix + 'tail'}>{text.slice(cursor)}</span>);
  return out;
}
