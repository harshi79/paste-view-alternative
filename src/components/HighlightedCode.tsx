import { highlightCode } from '@/lib/highlight';
import { detectLinks } from '@/lib/pasteFormat';

/**
 * Pure presentational renderer for a highlighted + auto-linked code block.
 * Used by the server-rendered paste viewer and by the (lazily loaded)
 * client viewer shown after a protected paste is unlocked. Because the
 * client path imports this module through a dynamic import, highlight.js
 * only ships to the browser when it is genuinely needed.
 */
export default function HighlightedCode({ content, language }: { content: string; language: string }) {
  const highlighted = highlightCode(content, language);
  return highlighted ? <AutoLinkedHtml html={highlighted} /> : <AutoLinkedText text={content} />;
}

type Segment = { kind: 'html'; value: string } | { kind: 'text'; value: string };

function AutoLinkedText({ text }: { text: string }) {
  return <code className="hljs whitespace-pre">{renderWithLinks(text)}</code>;
}

function AutoLinkedHtml({ html }: { html: string }) {
  const segments = hljsSegmentsWithLinks(html);
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

/**
 * Splits an hljs string into "<span …>…</span>" pieces and bare
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
    const openTag = html.slice(next, close + 1);
    if (openTag.startsWith('<span')) {
      const closingIdx = html.indexOf('</span>', close);
      if (closingIdx === -1) {
        out.push({ kind: 'html', value: html.slice(next) });
        break;
      }
      const inner = html.slice(close + 1, closingIdx);
      out.push({ kind: 'html', value: `${openTag}${inner}</span>` });
      i = closingIdx + 7;
    } else {
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
