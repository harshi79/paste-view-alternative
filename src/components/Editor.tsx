'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LANGUAGES } from '@/lib/languages';
import { EXPIRY_OPTIONS } from '@/lib/expiry';
import {
  type RichDoc,
  type RichLine,
  type FontId,
  FONTS,
  DEFAULT_FONT,
  buildInlineMarks,
} from '@/lib/pasteFormat';
import { loadStickerPack, type StickerEntry } from '@/lib/stickerPack';
import { splitLine, lineFont } from './richRender';
import StickerImage from './StickerImage';
import { nekoTokenSet, type NekoGif } from '@/lib/neko';

type Props = { username: string | null };

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 40] as const;
const COLORS = [
  '#dbe1f1', '#ffffff', '#a78bfa', '#22d3ee', '#4ade80', '#fbbf24',
  '#f87171', '#f472b6', '#a3e635', '#60a5fa', '#fb7185', '#facc15',
] as const;

const tb =
  'inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.07] hover:text-white';
const tbActive = 'border-brand-400/40 bg-brand-500/15 text-brand-100';

function emptyDoc(): RichDoc {
  return { v: 1, lines: [{ text: '', _key: 'l0' }] };
}

/** Drops the client-only `_key` identity before a doc is stored. */
function serializeDoc(doc: RichDoc): RichDoc {
  return { v: doc.v, lines: doc.lines.map(({ _key: _omit, ...rest }) => rest) };
}

function TextIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function RichIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M10 2.5 11.6 7 16 8.6 11.6 10.2 10 14.7 8.4 10.2 4 8.6 8.4 7 10 2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M15.5 13.5v3.5M13.75 15.25h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SlidersIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M3.5 5.5h9M16 5.5h.5M3.5 10h4M11 10h5.5M3.5 14.5h11M17.5 14.5h.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="14" cy="5.5" r="1.7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9.5" cy="10" r="1.7" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15" cy="14.5" r="1.7" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function EyeIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M2.5 10s2.6-4.75 7.5-4.75S17.5 10 17.5 10 14.9 14.75 10 14.75 2.5 10 2.5 10Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function GridIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="3.25" y="3.25" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.25" y="3.25" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3.25" y="11.25" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.25" y="11.25" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ChevronIcon({ className = 'h-3 w-3', open = false }: { className?: string; open?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      className={`${className} transition-transform ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path d="m5.5 7.75 4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6.5v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="13.4" r="0.9" fill="currentColor" />
    </svg>
  );
}

export default function Editor({ username }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('plaintext');
  const [visibility, setVisibility] = useState<'public' | 'unlisted'>('public');
  const [expiresIn, setExpiresIn] = useState('never');
  const [password, setPassword] = useState('');
  const [titleColor, setTitleColor] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // rich-text state
  const [rich, setRich] = useState<RichDoc>(emptyDoc);
  const [stickerPack, setStickerPack] = useState<StickerEntry[]>([]);
  const [nekoGifs, setNekoGifs] = useState<NekoGif[]>([]);
  const [activeLine, setActiveLine] = useState(0);
  const [showStickers, setShowStickers] = useState(false);
  const [stickerTab, setStickerTab] = useState<'pack' | 'anime'>('pack');
  const [showPreview, setShowPreview] = useState(false);
  const [stickerQuery, setStickerQuery] = useState('');
  const [format, setFormat] = useState<'plain' | 'rich'>('plain');

  const lineRefs = useRef<Array<HTMLDivElement | null>>([]);
  const packLoaded = useRef(false);
  const nekoLoaded = useRef(false);
  /** Monotonic id source for stable per-line React keys (uncontrolled DOM). */
  const keySeq = useRef(1);
  const nextLineKey = useCallback(() => `l${keySeq.current++}`, []);
  /** Tokens recognised as stickers: the DB pack plus every anime GIF token. */
  const stickerTokenSet = useMemo(
    () => new Set([...stickerPack.map((s) => s.token), ...nekoTokenSet()]),
    [stickerPack],
  );

  /** Loads the sticker pack on first need (panel open or rich mode). */
  const ensureStickerPack = useCallback(() => {
    if (packLoaded.current) return;
    packLoaded.current = true;
    loadStickerPack()
      .then((pack) => {
        setStickerPack(pack);
        // Mark any tokens already typed/loaded in every line.
        setRich((doc) => ({
          ...doc,
          lines: doc.lines.map((line) => ({
            ...line,
            marks: buildInlineMarks(line.text ?? '', new Set(pack.map((s) => s.token))),
          })),
        }));
      })
      .catch(() => {
        packLoaded.current = false;
      });
  }, []);

  /** Loads live anime GIFs from the Neko API once (first time the tab opens). */
  const ensureNekoGifs = useCallback(() => {
    if (nekoLoaded.current) return;
    nekoLoaded.current = true;
    fetch('/api/neko')
      .then((r) => (r.ok ? r.json() : { gifs: [] }))
      .then((d) => setNekoGifs(Array.isArray(d.gifs) ? d.gifs : []))
      .catch(() => {
        nekoLoaded.current = false;
      });
  }, []);

  useEffect(() => {
    if (format === 'rich') ensureStickerPack();
  }, [format, ensureStickerPack]);

  function updateLine(i: number, patch: Partial<RichLine>) {
    setRich((doc) => {
      const lines = doc.lines.slice();
      if (i < 0 || i >= lines.length) return doc;
      lines[i] = { ...lines[i], ...patch };
      return { ...doc, lines };
    });
  }

  /** Recomputes links + sticker/emoji marks for one line from its text. */
  function syncLineMarks(i: number, text: string) {
    const marks = buildInlineMarks(text, stickerTokenSet);
    setRich((doc) => {
      const lines = doc.lines.slice();
      if (i < 0 || i >= lines.length) return doc;
      lines[i] = { ...lines[i], text, marks };
      return { ...doc, lines };
    });
  }

  /**
   * The rich lines are UNCONTROLLED contentEditables: we seed their text
   * once from React state (see the ref below) and read it back on every
   * input, but we never feed the typed text back through React for the
   * editable itself. React thus never touches the DOM text node under the
   * caret, which is what previously made the caret jump to the front
   * (text appearing to type "backwards") and made backspace delete the
   * wrong character.
   */

  /** innerText, with the trailing newline Chrome adds for a trailing <br>. */
  function readLineText(el: HTMLElement): string {
    let text = el.innerText ?? '';
    if (text.endsWith('\n')) text = text.slice(0, -1);
    return text;
  }

  /** Character offset of a (node, offset) caret position within `root`. */
  function offsetWithin(root: HTMLElement, node: Node, offset: number): number {
    if (node === root) return offset;
    let pos = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const tn = walker.currentNode as Text;
      if (tn === node) return pos + offset;
      pos += tn.data.length;
    }
    return offset;
  }

  /** Collapses the caret to character `pos` inside `el` (a plain text node). */
  function placeCaretAt(el: HTMLElement, pos: number) {
    const node = el.firstChild as Text | null;
    if (!node) return;
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.setStart(node, Math.max(0, Math.min(pos, node.data.length)));
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function splitLineAt(i: number, at: number) {
    const text = rich.lines[i]?.text ?? '';
    const stickerUrls = { ...(rich.lines[i]?.stickerUrls || {}) };
    setRich((doc) => {
      const lines = doc.lines.slice();
      const line = lines[i];
      if (!line || at < 0 || at > line.text.length) return doc;
      // Both halves get fresh stable keys so React mounts NEW nodes that
      // re-seed their text via the ref (positional keys would reuse the
      // old node, whose "seeded" flag would stop the right half from ever
      // displaying its content when splitting in the middle of the doc).
      const left: RichLine = { ...line, _key: nextLineKey(), text: line.text.slice(0, at), marks: undefined, stickerUrls };
      const right: RichLine = {
        _key: nextLineKey(),
        text: line.text.slice(at),
        font: line.font,
        size: line.size,
        color: line.color,
        stickerUrls,
      };
      lines.splice(i, 1, left, right);
      return { ...doc, lines };
    });
    // Marks for both halves are recomputed on the next input; compute now.
    syncLineMarks(i, text.slice(0, at));
    syncLineMarks(i + 1, text.slice(at));
  }

  function handleLineInput(i: number, e: React.FormEvent<HTMLDivElement>) {
    const text = readLineText(e.currentTarget);
    syncLineMarks(i, text);
  }

  function handleLineKey(i: number, e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const sel = window.getSelection();
      let at = sel ? offsetWithin(e.currentTarget, sel.focusNode ?? e.currentTarget, sel.focusOffset) : 0;
      const len = rich.lines[i]?.text.length ?? 0;
      at = Math.max(0, Math.min(at, len));
      splitLineAt(i, at);
      requestAnimationFrame(() => {
        const next = lineRefs.current[i + 1];
        if (next) {
          next.focus();
          const s = window.getSelection();
          if (s) {
            const range = document.createRange();
            range.selectNodeContents(next);
            range.collapse(false);
            s.removeAllRanges();
            s.addRange(range);
          }
        }
        setActiveLine(i + 1);
      });
    }
  }

  /**
   * Inserts a sticker/GIF into the active line at the caret (appending when
   * the line is empty or the caret isn't inside it). `url` is the explicit
   * resolved GIF url for live anime stickers; pack stickers pass `undefined`
   * and resolve via the DB pack at render time.
   */
  function applyStickerToActiveLine(token: string, url?: string | null) {
    const i = activeLine;
    const el = lineRefs.current[i];
    const currentText = el ? readLineText(el) : (rich.lines[i]?.text ?? '');
    let at = currentText.length;
    if (el && document.activeElement === el) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (el.contains(range.startContainer)) {
          at = offsetWithin(el, range.startContainer, range.startOffset);
        }
      }
    }
    const newText = currentText.slice(0, at) + token + currentText.slice(at);
    syncLineMarks(i, newText);
    if (url) {
      setRich((doc) => {
        const lines = doc.lines.slice();
        if (i < 0 || i >= lines.length) return doc;
        const s = { ...(lines[i].stickerUrls || {}) };
        s[token] = url;
        lines[i] = { ...lines[i], stickerUrls: s };
        return { ...doc, lines };
      });
    }
    if (el) {
      el.textContent = newText;
      placeCaretAt(el, at + token.length);
      el.focus();
    }
    setShowStickers(false);
    setStickerQuery('');
    setActiveLine(i);
  }

  function switchStickerTab(tab: 'pack' | 'anime') {
    setStickerTab(tab);
    if (tab === 'anime') ensureNekoGifs();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (format === 'rich') {
      const text = rich.lines.map((l) => l.text).join('\n').trim();
      if (!text) {
        setError('Paste content is required.');
        return;
      }
    } else if (!content.trim()) {
      setError('Paste content is required.');
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim() || 'Untitled',
        format,
        content:
          format === 'rich'
            ? JSON.stringify(serializeDoc(rich))
            : content,
        language,
        visibility,
        expiresIn,
        password: password || undefined,
        titleColor: titleColor || undefined,
      };
      const res = await fetch('/api/pastes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Try again.');
        setBusy(false);
        return;
      }
      // After creating a paste, the share URL is never rendered in
      // plain text. Logged-in users go to /dashboard where the new
      // row is highlighted and exposes a click-to-copy button.
      // Guests are sent straight to the paste page where a
      // "Copy link" button does the same job.
      if (username) {
        router.push('/dashboard?created=' + data.id);
      } else {
        router.push('/p/' + data.id);
      }
    } catch {
      setError('Network error. Try again.');
      setBusy(false);
    }
  }

  const filteredStickers = useMemo(() => {
    const q = stickerQuery.toLowerCase().trim();
    const pool =
      stickerTab === 'anime'
        ? nekoGifs.map((g) => ({ token: g.token, url: g.url, emoji: g.emoji, label: g.label }))
        : stickerPack;
    if (!q) return pool.slice(0, 30);
    return pool
      .filter(
        (s) => s.token.toLowerCase().includes(q) || (s.label ?? '').toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [stickerQuery, stickerPack, nekoGifs, stickerTab]);

  const switching = (mode: 'plain' | 'rich') => {
    setFormat(mode);
    if (mode === 'rich') ensureStickerPack();
    setShowPreview(false);
  };

  const modeBtn = (active: boolean) =>
    `relative inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
      active ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-200'
    }`;

  const fieldLabel = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500';
  const languageLabel = LANGUAGES.find((l) => l.id === language)?.label ?? 'Plain text';
  const richChars = rich.lines.reduce((s, l) => s + (l.text?.length ?? 0), 0);

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.requestSubmit();
        }
      }}
      className="glass animate-fade-up overflow-hidden rounded-2xl shadow-[0_24px_64px_-28px_rgba(0,0,0,0.75)]"
    >
      {/* Header — the title is the primary field. */}
      <div className="flex flex-col gap-2.5 border-b border-white/[0.06] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
        <input
          type="text"
          aria-label="Paste title"
          className="w-full bg-transparent text-xl font-semibold tracking-tight text-white placeholder-zinc-600 outline-none sm:text-2xl"
          placeholder="Untitled paste"
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
        />
        <p className="shrink-0 text-xs text-zinc-500">
          {username ? (
            <>
              posting as <span className="font-semibold text-zinc-300">@{username}</span>
            </>
          ) : (
            'guest paste'
          )}
        </p>
      </div>

      {/* Toolbar — content mode, inline formatting (rich), options. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-2.5 sm:px-5">
        <div
          role="tablist"
          aria-label="Content mode"
          className="flex items-center rounded-lg border border-white/10 bg-white/[0.05] p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={format === 'plain'}
            onClick={() => switching('plain')}
            className={modeBtn(format === 'plain')}
          >
            <TextIcon />
            Text
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={format === 'rich'}
            onClick={() => switching('rich')}
            className={modeBtn(format === 'rich')}
          >
            <RichIcon />
            Rich
          </button>
        </div>

        {format === 'rich' && (
          <>
            <span className="hidden h-4 w-px bg-white/10 sm:block" />
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Line formatting">
              <select
                className="input !w-auto !px-2 !py-1.5 !text-xs"
                aria-label="Font"
                title="Font"
                value={rich.lines[activeLine]?.font ?? DEFAULT_FONT}
                onChange={(e) => updateLine(activeLine, { font: e.target.value as FontId })}
              >
                {FONTS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
              <select
                className="input !w-auto !px-2 !py-1.5 !text-xs"
                aria-label="Font size"
                title="Font size"
                value={rich.lines[activeLine]?.size ?? 14}
                onChange={(e) => updateLine(activeLine, { size: Number(e.target.value) })}
              >
                {FONT_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}px
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1 pl-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={`Text color ${c}`}
                    aria-label={`Text color ${c}`}
                    onClick={() => updateLine(activeLine, { color: c })}
                    className={`h-[18px] w-[18px] rounded-[5px] border transition-transform hover:scale-110 ${
                      (rich.lines[activeLine]?.color ?? '#dbe1f1') === c
                        ? 'border-white/80 ring-1 ring-white/40'
                        : 'border-white/15'
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <span className="hidden h-4 w-px bg-white/10 sm:block" />
            <button
              type="button"
              className={showStickers ? `${tb} ${tbActive}` : tb}
              aria-expanded={showStickers}
              aria-controls="sticker-picker"
              onClick={() => {
                setShowStickers((v) => !v);
                ensureStickerPack();
              }}
            >
              <GridIcon />
              Stickers
            </button>
            <button
              type="button"
              className={`${tb} ${showPreview ? tbActive : ''}`}
              aria-pressed={showPreview}
              onClick={() => setShowPreview((v) => !v)}
            >
              <EyeIcon />
              Preview
            </button>
          </>
        )}

        <button
          type="button"
          className={`${tb} ml-auto`}
          aria-expanded={showOptions}
          aria-controls="paste-options"
          onClick={() => setShowOptions((v) => !v)}
        >
          <SlidersIcon />
          Options
          <ChevronIcon open={showOptions} />
        </button>
      </div>

      {/* Settings panel — collapsed by default, keeps the editor uncluttered. */}
      {showOptions && (
        <div id="paste-options" className="animate-pop border-b border-white/[0.06] bg-white/[0.02] px-4 py-4 backdrop-blur-sm sm:px-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={fieldLabel} htmlFor="language">
                Language
              </label>
              <select id="language" className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={fieldLabel} htmlFor="expires">
                Expires in
              </label>
              <select id="expires" className="input" value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)}>
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={fieldLabel} htmlFor="visibility">
                Visibility
              </label>
              <select
                id="visibility"
                className="input"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as 'public' | 'unlisted')}
              >
                <option value="public">Public — listed</option>
                <option value="unlisted">Unlisted — link only</option>
              </select>
            </div>
            <div>
              <label className={fieldLabel} htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="input"
                placeholder="None"
                value={password}
                maxLength={64}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={fieldLabel} htmlFor="title-color">
                Title color
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id="title-color"
                  type="color"
                  value={titleColor || '#a78bfa'}
                  onChange={(e) => setTitleColor(e.target.value)}
                  className="h-8 w-11 cursor-pointer rounded-md border border-white/10 bg-transparent p-0.5"
                />
                <span className="font-mono text-xs text-zinc-500">
                  {titleColor ? titleColor.toUpperCase() : 'Default'}
                </span>
                {titleColor && (
                  <button
                    type="button"
                    onClick={() => setTitleColor('')}
                    className="text-xs font-medium text-zinc-400 underline-offset-2 transition-colors hover:text-white hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* The paste body — one large, quiet workspace. */}
      <div className="px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
        {format === 'plain' ? (
          <div className="relative overflow-hidden rounded-xl border border-white/[0.1] bg-white/[0.03] backdrop-blur-sm transition-colors focus-within:border-brand-400/40 focus-within:ring-4 focus-within:ring-brand-500/10">
            <textarea
              id="content"
              aria-label="Paste content"
              className="block min-h-[420px] w-full resize-y bg-transparent px-4 py-4 font-mono text-[13px] leading-6 text-zinc-100 placeholder-zinc-600 outline-none md:min-h-[520px]"
              placeholder="Paste your code or text here…"
              value={content}
              maxLength={100_000}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
            />
            <span className="pointer-events-none absolute right-3 top-3 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              {languageLabel}
            </span>
          </div>
        ) : showPreview ? (
          <div
            aria-label="Live preview"
            className="min-h-[420px] overflow-x-auto rounded-xl border border-white/[0.1] bg-white/[0.02] px-4 py-4 backdrop-blur-sm md:min-h-[520px]"
          >
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
              Live preview
            </p>
            <div className="text-sm leading-7">
              {rich.lines.map((line, i) => (
                <PreviewLine key={i} line={line} pack={stickerPack} />
              ))}
            </div>
          </div>
        ) : (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) lineRefs.current[0]?.focus();
            }}
            className="min-h-[420px] rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-4 backdrop-blur-sm transition-colors focus-within:border-brand-400/40 focus-within:ring-4 focus-within:ring-brand-500/10 md:min-h-[520px]"
          >
            {rich.lines.map((line, i) => (
              <div
                key={line._key ?? i}
                ref={(el) => {
                  lineRefs.current[i] = el;
                  // Seed the (uncontrolled) editable once — React never
                  // manages this text again, so the caret stays put while
                  // typing. New lines from Enter are seeded via this ref.
                  if (el && el.dataset.seeded !== 'true') {
                    el.textContent = line.text ?? '';
                    el.dataset.seeded = 'true';
                  }
                }}
                contentEditable
                suppressContentEditableWarning
                spellCheck={false}
                data-placeholder={i === 0 ? 'Type or paste your content…' : `Line ${i + 1}`}
                onInput={(e) => handleLineInput(i, e)}
                onKeyDown={(e) => handleLineKey(i, e)}
                onFocus={() => setActiveLine(i)}
                className="rich-line min-h-[1.6em] whitespace-pre-wrap break-words rounded px-1 outline-none transition-colors focus:bg-white/[0.04]"
                style={{
                  fontFamily: lineFont(line),
                  fontSize: `${line.size ?? 14}px`,
                  color: line.color ?? '#dbe1f1',
                }}
              />
            ))}
          </div>
        )}

        {format === 'rich' && !showPreview && (
          <p className="mt-2 px-1 text-xs text-zinc-600">
            Formatting applies to the line you last clicked · use a shortcode like{' '}
            <code className="font-mono text-zinc-500">:wave:</code> to insert a sticker
          </p>
        )}

        {/* Sticker picker — inline panel, always in reach on mobile. */}
        {format === 'rich' && showStickers && (
          <div id="sticker-picker" className="glass animate-pop mt-3 rounded-xl p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div
                role="tablist"
                aria-label="Sticker source"
                className="flex items-center rounded-lg border border-white/10 bg-white/[0.05] p-0.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={stickerTab === 'pack'}
                  onClick={() => switchStickerTab('pack')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    stickerTab === 'pack' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  Stickers
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={stickerTab === 'anime'}
                  onClick={() => switchStickerTab('anime')}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    stickerTab === 'anime' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  Anime GIFs
                </button>
              </div>
              <button
                type="button"
                aria-label="Close sticker picker"
                onClick={() => setShowStickers(false)}
                className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                  <path d="m6 6 8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <input
              className="input !py-2 text-sm"
              placeholder={
                stickerTab === 'anime'
                  ? 'Search anime GIFs — “hug”, “pat”, “wave”…'
                  : 'Search stickers — try “wave”, “fire”…'
              }
              value={stickerQuery}
              onChange={(e) => setStickerQuery(e.target.value)}
            />
            {stickerTab === 'anime' && nekoGifs.length === 0 && !stickerQuery ? (
              <p className="mt-4 text-sm text-zinc-500">Loading anime GIFs…</p>
            ) : filteredStickers.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">No stickers found — try another name.</p>
            ) : (
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                {filteredStickers.map((s) => (
                  <button
                    type="button"
                    key={s.token}
                    title={`${s.token} — ${s.label || ''}`}
                    onClick={() => applyStickerToActiveLine(s.token, s.url)}
                    className="flex aspect-square min-h-[52px] items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] transition-colors hover:border-brand-400/50 hover:bg-white/[0.06]"
                  >
                    {s.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.url}
                        alt={s.label || s.token}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                        className="h-8 w-8 object-contain"
                      />
                    ) : (
                      <span className="text-lg">{s.emoji ?? s.token}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2.5 border-t border-red-500/20 bg-red-500/[0.07] px-4 py-3 text-sm text-red-300 sm:px-5"
        >
          <AlertIcon />
          {error}
        </div>
      )}

      {/* Footer — quiet status, one clear action. */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5 ${
          error ? '' : 'border-t border-white/[0.06]'
        }`}
      >
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
          <span>
            {format === 'rich'
              ? `${richChars.toLocaleString()} chars`
              : `${content.length.toLocaleString()} / 100,000 chars`}
          </span>
          <span className="hidden h-3 w-px bg-white/10 sm:block" />
          <span className="hidden sm:inline">
            {format === 'rich'
              ? 'URLs auto-link · no previews generated'
              : 'links auto-link · no previews generated'}
          </span>
          <kbd className="hidden rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 lg:inline-block">
            Ctrl/⌘ + Enter
          </kbd>
        </p>
        <button type="submit" disabled={busy} className="btn-primary min-w-[150px]">
          {busy ? 'Creating…' : 'Create paste'}
        </button>
      </div>
    </form>
  );
}

/** Renders one rich line as it will appear in the final paste. */
function PreviewLine({ line, pack }: { line: RichLine; pack: StickerEntry[] }) {
  const segments = splitLine(line, {
    renderSticker: (m, slice, stickerUrls) => (
      <StickerImage token={m.value} fallback={slice} pack={pack} url={stickerUrls?.[m.value]} />
    ),
    renderEmoji: (m) => (
      <span className="text-[1.05em]" title={m.value}>
        {m.value}
      </span>
    ),
  });
  return (
    <div
      className="whitespace-pre-wrap break-words"
      style={{
        fontFamily: lineFont(line),
        fontSize: line.size ? `${line.size}px` : '14px',
        color: line.color ?? '#dbe1f1',
      }}
    >
      {segments}
    </div>
  );
}
