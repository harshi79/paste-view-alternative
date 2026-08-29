/**
 * Server-side syntax highlighting.
 *
 * We intentionally register ONLY the languages VibeBin exposes (instead of
 * `highlight.js/lib/common`, which pulls in ~190 grammars) and run the
 * highlighting on the server. This keeps the browser bundle tiny — the
 * paste viewer ships zero highlight.js code to the client.
 */
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const LANGUAGES: Record<string, unknown> = {
  bash,
  c,
  cpp,
  csharp,
  css,
  go,
  java,
  javascript,
  json,
  markdown,
  php,
  python,
  ruby,
  rust,
  sql,
  typescript,
  xml,
  yaml,
};

for (const [name, lang] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, lang as Parameters<typeof hljs.registerLanguage>[1]);
}

/** Maps a VibeBin language id to a registered highlight.js grammar. */
export function registeredHljsLanguage(id: string): string | null {
  if (!id || id === 'plaintext') return null;
  return id === 'html' ? 'xml' : id;
}

/** Returns highlighted HTML, or null when no grammar applies. */
export function highlightCode(content: string, language: string): string | null {
  const lang = registeredHljsLanguage(language);
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(content, { language: lang, ignoreIllegals: true }).value;
    }
  } catch {
    /* fall through to plain */
  }
  return null;
}
