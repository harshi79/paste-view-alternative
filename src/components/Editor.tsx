'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
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
import { loadStickerPack, rememberSticker, type StickerEntry } from '@/lib/stickerPack';
import { lineFont } from './richRender';
import { nekoTokenSet, type NekoGif } from '@/lib/neko';

// The live preview reuses the paste page's rich renderer (including
// language-driven syntax highlighting). Loaded lazily only when the
// preview panel opens so highlight.js + grammars stay out of the editor's
// initial bundle; the editable surface itself is never highlighted.
const RichPreview = dynamic(() => import('./RichPreview'), {
  ssr: false,
  loading: () => (
    <div className="grid h-[clamp(280px,55dvh,560px)] place-items-center text-sm text-zinc-500">
      Preparing preview…
    </div>
  ),
});

type Props = { username: string | null };

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 40] as const;
const COLORS = [
  '#dbe1f1', '#ffffff', '#a78bfa', '#22d3ee', '#4ade80', '#fbbf24',
  '#f87171', '#f472b6', '#a3e635', '#60a5fa', '#fb7185', '#facc15',
] as const;

const tb =
  'inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:bg-white/[0.08] hover:text-white';
const tbActive = 'border-brand-400/40 bg-brand-500/15 text-white shadow-[0_10px_24px_-20px_rgba(139,92,246,0.9)]';

function emptyDoc(): RichDoc {
  return { v: 1, lines: [{ text: '', _key: 'l0' }] };
}

/** Drops the client-only `_key` identity before a doc is stored. */
function serializeDoc(doc: RichDoc): RichDoc {
  return { v: doc.v, lines: doc.lines.map(({ _key: _omit, ...rest }) => rest) };
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

/**
 * The unified paste editor.
 *
 * There is no "Text" vs "Rich" mode any more: a single line-based rich
 * composer handles everything. Untouched lines are exactly what a plain
 * text paste used to be (they render in the default mono font, links and
 * sticker/emoji shortcodes auto-resolve); clicking a font/size/color or
 * inserting a sticker/GIF layers rich formatting on top of the same doc.
 * Submission always posts the serialised `RichDoc` as `format: "rich"` —
 * plain text is simply an unstyled RichDoc. Legacy 'plain' pastes are
 * still read and rendered by the existing viewer paths.
 */
export default function Editor({ username }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('plaintext');
  const [visibility, setVisibility] = useState<'public' | 'unlisted'>('public');
  const [expiresIn, setExpiresIn] = useState('never');
  const [passwordProtectionEnabled, setPasswordProtectionEnabled] = useState(false);
  const [password, setPassword] = useState('');
  const [titleColor, setTitleColor] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // document state (the single unified editor — no plain/rich mode)
  const [rich, setRich] = useState<RichDoc>(emptyDoc);
  const [stickerPack, setStickerPack] = useState<StickerEntry[]>([]);
  const [nekoGifs, setNekoGifs] = useState<NekoGif[]>([]);
  const [gifResults, setGifResults] = useState<Array<{ id: string; url: string; preview: string | null; label: string }>>([]);
  const [searchingGifs, setSearchingGifs] = useState(false);
  const [importingGif, setImportingGif] = useState<string | null>(null);
  const [activeLine, setActiveLine] = useState(0);
  const [showStickers, setShowStickers] = useState(false);
  const [stickerTab, setStickerTab] = useState<'pack' | 'anime'>('pack');
  const [showPreview, setShowPreview] = useState(false);
  const [stickerQuery, setStickerQuery] = useState('');

  const lineRefs = useRef<Array<HTMLDivElement | null>>([]);
  const stickerBtnRef = useRef<HTMLButtonElement | null>(null);
  const stickerPanelRef = useRef<HTMLDivElement | null>(null);
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

  /** Loads the sticker pack once (mount + first open of the picker panel). */
  const ensureStickerPack = useCallback(() => {
    if (packLoaded.current) return;
    packLoaded.current = true;
    loadStickerPack()
      .then((pack) => {
        setStickerPack(pack);
        // Mark any tokens already typed/loaded in every line.
        // IMPORTANT: Pass extraTokens from line.stickerUrls so custom tokens
        // (like searched GIFs) are preserved when the pack loads.
        setRich((doc) => ({
          ...doc,
          lines: doc.lines.map((line) => {
            const extra = new Set(Object.keys(line.stickerUrls ?? {}));
            return {
              ...line,
              marks: buildInlineMarks(line.text ?? '', new Set(pack.map((s) => s.token)), extra),
            };
          }),
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

  /** Fetches GIF search results from /api/gifs for the current query. */
  const handleGifSearch = useCallback(
    async (q: string) => {
      const query = q.trim();
      if (!query) {
        setGifResults([]);
        setSearchingGifs(false);
        return;
      }
      setSearchingGifs(true);
      try {
        const res = await fetch(`/api/gifs?q=${encodeURIComponent(query)}`);
        const data = (await res.json()) as {
          gifs?: Array<{ id: string; url: string; preview: string | null; label: string }>;
        };
        setGifResults(Array.isArray(data.gifs) ? data.gifs : []);
      } catch {
        setGifResults([]);
      } finally {
        setSearchingGifs(false);
      }
    },
    [],
  );

  // The unified editor always resolves sticker/emoji shortcodes, so the
  // pack is needed immediately on mount (marks are rebuilt when it lands).
  useEffect(() => {
    ensureStickerPack();
  }, [ensureStickerPack]);

  // Clicking outside the floating sticker picker (or its toggle) closes it.
  useEffect(() => {
    if (!showStickers) return;
    function onPointerDown(e: MouseEvent) {
      const t = e.target as Node;
      if (stickerPanelRef.current?.contains(t)) return;
      if (stickerBtnRef.current?.contains(t)) return;
      setShowStickers(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [showStickers]);

  // Debounced GIF search while the Anime GIFs tab is open.
  useEffect(() => {
    if (stickerTab !== 'anime' || !showStickers) return;
    const q = stickerQuery.trim();
    if (!q) {
      setGifResults([]);
      setSearchingGifs(false);
      return;
    }
    const t = setTimeout(() => handleGifSearch(q), 350);
    return () => clearTimeout(t);
  }, [stickerQuery, stickerTab, showStickers, handleGifSearch]);

  function updateLine(i: number, patch: Partial<RichLine>) {
    setRich((doc) => {
      const lines = doc.lines.slice();
      if (i < 0 || i >= lines.length) return doc;
      lines[i] = { ...lines[i], ...patch };
      return { ...doc, lines };
    });
  }

  /** Recomputes links + sticker/emoji marks for one line from its text. */
  function syncLineMarks(i: number, text: string, additionalTokens: readonly string[] = []) {
    // Any token that has an explicit url stored on the line counts as a
    // sticker (covers live/search GIFs inserted via stickerUrls).
    // IMPORTANT: Compute marks INSIDE the functional updater to read the
    // latest stickerUrls from the doc, not from the closure. This fixes
    // a race condition where insertGifUrl/applyStickerToActiveLine call
    // setRich to add stickerUrls, then call syncLineMarks, but the closure
    // still has the old stickerUrls, so custom tokens aren't recognized.
    setRich((doc) => {
      const lines = doc.lines.slice();
      if (i < 0 || i >= lines.length) return doc;
      const extra = new Set<string>(additionalTokens);
      for (const key of Object.keys(lines[i]?.stickerUrls ?? {})) extra.add(key);
      const marks = buildInlineMarks(text, stickerTokenSet, extra);
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
  function applyStickerToActiveLine(token: string, url?: string | null, newlyPersisted = false) {
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
    syncLineMarks(i, newText, newlyPersisted ? [token] : []);
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

  /** Promote a trusted provider result to the pack, then insert its stable token. */
  async function importAndInsertGif(
    key: string,
    payload: { source: 'giphy'; id: string } | { source: 'neko'; url: string; category: string },
  ) {
    setImportingGif(key);
    setError('');
    try {
      const res = await fetch('/api/stickers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { sticker?: StickerEntry; error?: string };
      if (!res.ok || !data.sticker) {
        setError(data.error || 'Could not add that GIF to the sticker pack.');
        return;
      }
      const sticker = data.sticker;
      rememberSticker(sticker);
      setStickerPack((pack) =>
        pack.some((item) => item.token.toLowerCase() === sticker.token.toLowerCase())
          ? pack
          : [...pack, sticker].sort((a, b) => a.token.localeCompare(b.token)),
      );
      // The mark is built immediately even though React has not committed the
      // updated pack state yet. No paste-local URL is needed for new imports.
      applyStickerToActiveLine(sticker.token, null, true);
      setGifResults([]);
    } catch {
      setError('Could not add that GIF to the sticker pack.');
    } finally {
      setImportingGif(null);
    }
  }

  function switchStickerTab(tab: 'pack' | 'anime') {
    setStickerTab(tab);
    if (tab === 'anime') {
      ensureNekoGifs();
      // Keep the search results in sync with the current query on tab open.
      handleGifSearch(stickerQuery);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const text = rich.lines.map((l) => l.text).join('\n').trim();
    if (!text) {
      setError('Paste content is required.');
      return;
    }
    if (passwordProtectionEnabled && !password) {
      setError('Enter a password or turn off password protection.');
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim() || 'Untitled',
        // The unified editor always posts a RichDoc. Plain text is an
        // unstyled doc — the server keeps accepting format 'plain' too so
        // stored pastes and any existing clients keep working unchanged.
        format: 'rich',
        content: JSON.stringify(serializeDoc(rich)),
        language,
        visibility,
        expiresIn,
        // Password protection is strictly opt-in. Keeping this explicit also
        // prevents a browser/password manager autofill from locking a paste.
        passwordProtected: passwordProtectionEnabled,
        password: passwordProtectionEnabled ? password : undefined,
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
    if (!q) return stickerPack.slice(0, 30);
    return stickerPack
      .filter(
        (s) => s.token.toLowerCase().includes(q) || (s.label ?? '').toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [stickerQuery, stickerPack]);

  const fieldLabel = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500';
  const richChars = rich.lines.reduce((s, l) => s + (l.text?.length ?? 0), 0);
  const currentLine = rich.lines[activeLine] ?? rich.lines[0];
  const currentFont = FONTS.find((f) => f.id === (currentLine?.font ?? DEFAULT_FONT))?.label ?? 'Mono';
  const currentSize = currentLine?.size ?? 14;
  const currentLanguage = LANGUAGES.find((l) => l.id === language)?.label ?? language;
  const currentExpiry = EXPIRY_OPTIONS.find((o) => o.id === expiresIn)?.label ?? expiresIn;

  return (
    <div className="relative">
    <form
      onSubmit={submit}
      autoComplete="off"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.requestSubmit();
        }
      }}
      className="glass animate-fade-up overflow-hidden rounded-[30px] border border-white/[0.08] shadow-[0_36px_90px_-42px_rgba(0,0,0,0.9)]"
    >
      <div className="border-b border-white/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Unified editor</p>
            <input
              type="text"
              aria-label="Paste title"
              className="mt-3 w-full bg-transparent text-[1.9rem] font-black tracking-tight text-white placeholder-zinc-600 outline-none sm:text-[2.2rem]"
              placeholder="Untitled paste"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-[15px]">
              Plain text, code, and rich formatting all live in the same canvas. Start simple, then
              layer formatting only where it adds meaning.
            </p>
          </div>

          <div className="grid gap-3 lg:min-w-[280px] lg:max-w-[320px]">
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <span className="pill">{username ? `@${username}` : 'Guest paste'}</span>
              <span className="pill">{visibility === 'public' ? 'Public' : 'Unlisted'}</span>
              <span className="pill">{passwordProtectionEnabled ? 'Password protected' : 'Open access'}</span>
            </div>
            <div className="surface-subtle rounded-2xl p-3.5">
              <div className="flex items-center justify-between gap-3 text-xs text-zinc-500">
                <span>Language</span>
                <span className="font-medium text-zinc-200">{currentLanguage}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
                <span>Expiration</span>
                <span className="font-medium text-zinc-200">{currentExpiry}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
                <span>Characters</span>
                <span className="font-medium text-zinc-200">{richChars.toLocaleString()} / 100,000</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-white/[0.06] bg-black/[0.15] px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Active line {activeLine + 1}
            </span>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-2">
              <select
                className="input !w-auto !min-w-[118px] !rounded-xl !px-3 !py-2 !text-xs"
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
                className="input !w-auto !min-w-[88px] !rounded-xl !px-3 !py-2 !text-xs"
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
              <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-black/10 p-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={`Text color ${c}`}
                    aria-label={`Text color ${c}`}
                    onClick={() => updateLine(activeLine, { color: c })}
                    className={`h-5 w-5 rounded-md border transition-transform hover:scale-110 ${
                      (rich.lines[activeLine]?.color ?? '#dbe1f1') === c
                        ? 'border-white/80 ring-2 ring-white/20'
                        : 'border-white/10'
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <p className="text-xs text-zinc-500">
              {currentFont} · {currentSize}px · formatting applies to the line you last clicked
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              ref={stickerBtnRef}
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
            <button
              type="button"
              className={`${tb} ${showOptions ? tbActive : ''}`}
              aria-expanded={showOptions}
              aria-controls="paste-options"
              onClick={() => setShowOptions((v) => !v)}
            >
              <SlidersIcon />
              Options
              <ChevronIcon open={showOptions} />
            </button>
          </div>
        </div>
      </div>

      {showOptions && (
        <div id="paste-options" className="animate-pop border-b border-white/[0.06] bg-white/[0.02] px-4 py-4 sm:px-5">
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <div className="surface-subtle rounded-2xl p-4">
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
              <p className="mt-2 text-xs leading-5 text-zinc-500">Controls syntax highlighting when the paste is viewed. Plain text stays unhighlighted; rich colors, stickers, links and emoji always keep their own styling.</p>
            </div>

            <div className="surface-subtle rounded-2xl p-4">
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
              <p className="mt-2 text-xs leading-5 text-zinc-500">Set how long the paste should stay available before automatic removal.</p>
            </div>

            <div className="surface-subtle rounded-2xl p-4">
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
              <p className="mt-2 text-xs leading-5 text-zinc-500">Public pastes appear normally. Unlisted pastes still work, but only for people with the link.</p>
            </div>

            <div className="surface-subtle rounded-2xl p-4 xl:col-span-2">
              <span className={fieldLabel}>Access</span>
              <label
                htmlFor="password-protection"
                className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3 transition-colors hover:bg-white/[0.05]"
              >
                <input
                  id="password-protection"
                  type="checkbox"
                  checked={passwordProtectionEnabled}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setPasswordProtectionEnabled(enabled);
                    if (!enabled) setPassword('');
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-violet-500"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-zinc-200">Password protection</span>
                  <span className="mt-1 block text-xs leading-5 text-zinc-500">
                    {passwordProtectionEnabled
                      ? 'On — visitors must enter the password before content is fetched.'
                      : 'Off — anyone with access to the paste can view it immediately.'}
                  </span>
                </span>
              </label>
              {passwordProtectionEnabled && (
                <div className="animate-pop mt-3">
                  <label className={fieldLabel} htmlFor="paste-access-key">
                    Paste password
                  </label>
                  <input
                    id="paste-access-key"
                    name="paste-access-key"
                    type="password"
                    className="input"
                    placeholder="Choose a password"
                    value={password}
                    maxLength={64}
                    autoComplete="new-password"
                    data-1p-ignore
                    data-lpignore="true"
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="surface-subtle rounded-2xl p-4">
              <label className={fieldLabel} htmlFor="title-color">
                Title color
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  id="title-color"
                  type="color"
                  value={titleColor || '#a78bfa'}
                  onChange={(e) => setTitleColor(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-xl border border-white/10 bg-transparent p-1"
                />
                <span className="font-mono text-xs text-zinc-400">
                  {titleColor ? titleColor.toUpperCase() : 'Default title'}
                </span>
                {titleColor && (
                  <button
                    type="button"
                    onClick={() => setTitleColor('')}
                    className="text-xs font-semibold text-zinc-400 underline-offset-2 transition-colors hover:text-white hover:underline"
                  >
                    Reset
                  </button>
                )}
              </div>
              <p className="mt-2 text-xs leading-5 text-zinc-500">Adds a custom accent to the paste title without changing any content behavior.</p>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
        <div className="overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#060912]/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-black/20 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="window-dots" aria-hidden="true">
                <span className="window-dot bg-rose-400/80" />
                <span className="window-dot bg-amber-400/80" />
                <span className="window-dot bg-emerald-400/80" />
              </span>
              <div>
                <p className="text-xs font-semibold text-zinc-200">{showPreview ? 'Live preview' : 'Editor canvas'}</p>
                <p className="text-[11px] text-zinc-500">
                  {showPreview
                    ? 'Review exactly how the paste will render.'
                    : 'Type or paste content, then add formatting to individual lines.'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400">
              <span className="pill">{showPreview ? 'Previewing' : `Line ${activeLine + 1}`}</span>
              <span className="pill">Ctrl/⌘ + Enter to publish</span>
            </div>
          </div>

          {showPreview ? (
            <div
              aria-label="Live preview"
              className="paste-editor-scroll h-[clamp(280px,55dvh,560px)] overflow-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.015),transparent_25%)]"
            >
              {/* Same renderer the final paste page uses — including the
                  language-driven syntax highlighting. Loaded on demand. */}
              <RichPreview
                doc={serializeDoc(rich)}
                language={language}
                pack={stickerPack}
              />
            </div>
          ) : (
            <div
              onClick={(e) => {
                if (e.target === e.currentTarget) lineRefs.current[0]?.focus();
              }}
              className="paste-editor-scroll h-[clamp(280px,55dvh,560px)] overflow-y-auto overscroll-contain bg-[linear-gradient(180deg,rgba(255,255,255,0.015),transparent_25%)] px-3 py-4 transition-colors focus-within:ring-4 focus-within:ring-brand-500/10 md:px-4"
            >
              {rich.lines.map((line, i) => (
                <div
                  key={line._key ?? i}
                  className={`group grid grid-cols-[auto_1fr] gap-4 rounded-xl px-2 py-1.5 transition-colors ${
                    activeLine === i ? 'bg-white/[0.035]' : 'hover:bg-white/[0.02]'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`pt-1 text-right font-mono text-[11px] transition-colors ${
                      activeLine === i ? 'text-brand-300' : 'text-zinc-600'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div
                    ref={(el) => {
                      lineRefs.current[i] = el;
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
                    className="rich-line min-h-[1.7em] whitespace-pre-wrap break-words rounded-lg px-2 py-0.5 outline-none transition-colors focus:bg-white/[0.04]"
                    style={{
                      fontFamily: lineFont(line),
                      fontSize: `${line.size ?? 14}px`,
                      color: line.color ?? '#dbe1f1',
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {!showPreview && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
            <span className="pill">Plain text needs nothing extra</span>
            <span className="pill">
              Use a shortcode like <code className="font-mono text-zinc-300">:wave:</code>
            </span>
            <span className="pill">Links auto-open, previews stay off</span>
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

      <div
        className={`flex flex-col gap-4 px-4 py-4 sm:px-5 sm:flex-row sm:items-center sm:justify-between ${
          error ? '' : 'border-t border-white/[0.06]'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span className="pill">{`${richChars.toLocaleString()} / 100,000 chars`}</span>
          <span className="pill">
            {visibility === 'public' ? 'Public paste' : 'Unlisted paste'} ·{' '}
            {passwordProtectionEnabled ? 'Password protected' : 'No password'}
          </span>
          <span className="pill hidden md:inline-flex">No link previews are generated</span>
        </div>
        <button type="submit" disabled={busy} className="btn-primary min-w-[170px] self-start sm:self-auto">
          {busy ? 'Creating…' : 'Create paste'}
        </button>
      </div>
    </form>

        {showStickers && (
          <div
            ref={stickerPanelRef}
            id="sticker-picker"
            role="dialog"
            aria-label="Sticker picker"
            className="glass animate-pop fixed right-3 top-20 z-50 flex max-h-[min(36rem,calc(100dvh-5.5rem))] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[24px] p-4 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.85)] md:absolute md:right-0 md:top-24 md:max-h-[min(36rem,calc(100%-6rem))]"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Insert stickers and reaction GIFs</p>
                <p className="mt-1 text-xs text-zinc-500">Items are inserted into the line you last focused.</p>
              </div>
              <div
                role="tablist"
                aria-label="Sticker source"
                className="flex items-center rounded-xl border border-white/10 bg-white/[0.05] p-1"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={stickerTab === 'pack'}
                  onClick={() => switchStickerTab('pack')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
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
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    stickerTab === 'anime' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  Anime GIFs
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <input
                className="input !py-2.5 text-sm"
                placeholder={
                  stickerTab === 'anime'
                    ? 'Search anime GIFs — “hug”, “pat”, “wave”…'
                    : 'Search stickers — try “wave”, “fire”…'
                }
                value={stickerQuery}
                onChange={(e) => setStickerQuery(e.target.value)}
              />
              <button
                type="button"
                aria-label="Close sticker picker"
                onClick={() => setShowStickers(false)}
                className="btn-ghost !px-3.5 !py-2 text-xs"
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {stickerTab === 'anime' ? (
              stickerQuery.trim() ? (
                searchingGifs ? (
                  <p className="mt-4 text-sm text-zinc-500">Searching GIFs…</p>
                ) : gifResults.length === 0 ? (
                  <p className="mt-4 text-sm text-zinc-500">No GIFs found — try another term.</p>
                ) : (
                  <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {gifResults.map((g) => (
                      <button
                        type="button"
                        key={g.url}
                        title={g.label}
                        disabled={importingGif === g.url}
                        onClick={() => importAndInsertGif(g.url, { source: 'giphy', id: g.id })}
                        className="flex aspect-square min-h-[58px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:border-brand-400/50 hover:bg-white/[0.06]"
                      >
                        <img
                          src={g.preview || g.url}
                          alt={g.label}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )
              ) : nekoGifs.length === 0 ? (
                <p className="mt-4 text-sm text-zinc-500">Loading anime GIFs…</p>
              ) : (
                <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {nekoGifs.map((g) => (
                    <button
                      type="button"
                      key={g.token}
                      title={`${g.token} — ${g.label}`}
                      disabled={!!g.url && importingGif === g.url}
                      onClick={() =>
                        g.url
                          ? importAndInsertGif(g.url, {
                              source: 'neko',
                              url: g.url,
                              category: g.token.slice(':anime-'.length, -1),
                            })
                          : applyStickerToActiveLine(g.token)
                      }
                      className="flex aspect-square min-h-[58px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:border-brand-400/50 hover:bg-white/[0.06]"
                    >
                      {g.url ? (
                        <img
                          src={g.url}
                          alt={g.label}
                          loading="lazy"
                          decoding="async"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                          className="h-9 w-9 object-contain"
                        />
                      ) : (
                        <span className="text-lg">{g.emoji}</span>
                      )}
                    </button>
                  ))}
                </div>
              )
            ) : filteredStickers.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">No stickers found — try another name.</p>
            ) : (
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {filteredStickers.map((s) => (
                  <button
                    type="button"
                    key={s.token}
                    title={`${s.token} — ${s.label || ''}`}
                    onClick={() => applyStickerToActiveLine(s.token, s.url)}
                    className="flex aspect-square min-h-[58px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:border-brand-400/50 hover:bg-white/[0.06]"
                  >
                    {s.url ? (
                      <img
                        src={s.url}
                        alt={s.label || s.token}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                        className="h-9 w-9 object-contain"
                      />
                    ) : (
                      <span className="text-lg">{s.emoji ?? s.token}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
            </div>
          </div>
        )}
    </div>

  );
}
