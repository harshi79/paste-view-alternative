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

type Props = { username: string | null };

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 40] as const;
const COLORS = [
  '#dbe1f1', '#ffffff', '#a78bfa', '#22d3ee', '#4ade80', '#fbbf24',
  '#f87171', '#f472b6', '#a3e635', '#60a5fa', '#fb7185', '#facc15',
] as const;

function emptyDoc(): RichDoc {
  return { v: 1, lines: [{ text: '' }] };
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
  const [activeLine, setActiveLine] = useState(0);
  const [showStickers, setShowStickers] = useState(false);
  const [stickerQuery, setStickerQuery] = useState('');
  const [format, setFormat] = useState<'plain' | 'rich'>('plain');

  const lineRefs = useRef<Array<HTMLDivElement | null>>([]);
  const packLoaded = useRef(false);
  const stickerTokenSet = useMemo(() => new Set(stickerPack.map((s) => s.token)), [stickerPack]);

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

  function splitLineAt(i: number, at: number) {
    setRich((doc) => {
      const lines = doc.lines.slice();
      const line = lines[i];
      if (!line || at < 0 || at > line.text.length) return doc;
      const left: RichLine = { ...line, text: line.text.slice(0, at) };
      const right: RichLine = {
        text: line.text.slice(at),
        font: line.font,
        size: line.size,
        color: line.color,
      };
      left.marks = undefined;
      right.marks = undefined;
      lines.splice(i, 1, left, right);
      return { ...doc, lines };
    });
    // Marks for both halves are recomputed on the next input; compute now.
    const text = rich.lines[i]?.text ?? '';
    syncLineMarks(i, text.slice(0, at));
    syncLineMarks(i + 1, text.slice(at));
  }

  function handleLineInput(i: number, e: React.FormEvent<HTMLDivElement>) {
    const text = e.currentTarget.innerText ?? '';
    syncLineMarks(i, text);
  }

  function handleLineKey(i: number, e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const sel = window.getSelection();
      const at = sel?.focusOffset ?? (rich.lines[i]?.text.length ?? 0);
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

  function applyStickerToActiveLine(token: string) {
    const i = activeLine;
    const line = rich.lines[i] ?? { text: '' };
    const text = line.text + token;
    syncLineMarks(i, text);
    setShowStickers(false);
    setStickerQuery('');
    requestAnimationFrame(() => {
      lineRefs.current[i]?.focus();
    });
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
        content: format === 'rich' ? JSON.stringify(rich) : content,
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

  const input =
    'w-full rounded-xl border border-white/10 bg-night-800/80 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20';
  const label = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400';
  const chip = 'rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-zinc-200 transition hover:bg-white/10';
  const chipActive = 'border-brand-400/60 bg-brand-500/20 text-brand-100';

  const filteredStickers = useMemo(() => {
    const q = stickerQuery.toLowerCase().trim();
    if (!q) return stickerPack.slice(0, 24);
    return stickerPack
      .filter(
        (s) => s.token.toLowerCase().includes(q) || (s.label ?? '').toLowerCase().includes(q),
      )
      .slice(0, 24);
  }, [stickerQuery, stickerPack]);

  const switching = (mode: 'plain' | 'rich') => {
    setFormat(mode);
    if (mode === 'rich') ensureStickerPack();
  };

  const modeBtn = (active: boolean) =>
    `relative flex flex-col items-center gap-0.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
      active ? 'bg-brand-500/15 text-white shadow-inner' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
    }`;

  return (
    <form
      onSubmit={submit}
      className="animate-fade-up rounded-2xl border border-white/10 bg-night-800/60 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white">Create a new paste</h2>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-400">
          {username ? (
            <>
              posting as <span className="font-semibold text-brand-300">@{username}</span>
            </>
          ) : (
            'as guest — no account needed'
          )}
        </span>
      </div>

      {/* Unified mode toggle — one paste area, two content modes. */}
      <div
        role="tablist"
        aria-label="Paste mode"
        className="mb-5 grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-night-900/80 p-1.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={format === 'plain'}
          onClick={() => switching('plain')}
          className={modeBtn(format === 'plain')}
        >
          <span className="text-base font-bold">📝 Basic</span>
          <span className="text-[11px] font-normal text-zinc-500">
            Plain text & code · syntax highlighting
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={format === 'rich'}
          onClick={() => switching('rich')}
          className={modeBtn(format === 'rich')}
        >
          <span className="text-base font-bold">✨ Rich</span>
          <span className="text-[11px] font-normal text-zinc-500">
            Fonts, colors, emoji & animated stickers
          </span>
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className={label} htmlFor="title">
            Title
          </label>
          <input
            id="title"
            className={input}
            placeholder="Untitled"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {format === 'plain' ? (
          <div>
            <label className={label} htmlFor="content">
              Content
            </label>
            <textarea
              id="content"
              className={`${input} min-h-[240px] resize-y font-mono text-[13px] leading-relaxed`}
              placeholder="Paste your code or text here…"
              value={content}
              maxLength={100_000}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
            />
            <p className="mt-1 text-xs text-zinc-500">
              {content.length.toLocaleString()} / 100,000 characters · any http(s) / www / email
              link will be clickable automatically. No link previews are generated.
            </p>
          </div>
        ) : (
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <label className={`${label} mb-0`}>Rich content</label>
              <span className="ml-auto flex flex-wrap items-center gap-1">
                <select
                  className={`${input} !w-auto !py-1 text-xs`}
                  value={rich.lines[activeLine]?.font ?? DEFAULT_FONT}
                  onChange={(e) => updateLine(activeLine, { font: e.target.value as FontId })}
                >
                  {FONTS.map((f) => (
                    <option key={f.id} value={f.id}>
                      Font: {f.label}
                    </option>
                  ))}
                </select>
                <select
                  className={`${input} !w-auto !py-1 text-xs`}
                  value={rich.lines[activeLine]?.size ?? 14}
                  onChange={(e) =>
                    updateLine(activeLine, { size: Number(e.target.value) })
                  }
                >
                  {FONT_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s}px
                    </option>
                  ))}
                </select>
                <span className="ml-2 inline-flex items-center gap-1">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={c}
                      onClick={() => updateLine(activeLine, { color: c })}
                      className="h-5 w-5 rounded border border-white/15 transition hover:scale-110"
                      style={{ background: c }}
                    />
                  ))}
                </span>
              </span>
            </div>

            <div className="rounded-xl border border-white/10 bg-night-900/80 p-3">
              {rich.lines.map((line, i) => (
                <div
                  key={i}
                  ref={(el) => {
                    lineRefs.current[i] = el;
                  }}
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck={false}
                  onInput={(e) => handleLineInput(i, e)}
                  onKeyDown={(e) => handleLineKey(i, e)}
                  onFocus={() => setActiveLine(i)}
                  className="min-h-[1.6em] rounded px-1 outline-none focus:bg-white/5"
                  style={{
                    fontFamily: lineFont(line),
                    fontSize: `${line.size ?? 14}px`,
                    color: line.color ?? '#dbe1f1',
                  }}
                >
                  {line.text ?? ''}
                </div>
              ))}
            </div>

            {/* Live preview — stickers/GIFs/emoji render exactly like the result. */}
            <div className="mt-2 rounded-xl border border-white/10 bg-night-900/60 p-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Live preview — how it will render
              </p>
              <div className="leading-7">
                {rich.lines.map((line, i) => (
                  <PreviewLine key={i} line={line} pack={stickerPack} />
                ))}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <button
                type="button"
                className={chip}
                onClick={() => {
                  setShowStickers((v) => !v);
                  ensureStickerPack();
                }}
              >
                😺 Stickers & emoji
              </button>
              <span>
                Type :wave: / ;happy; for stickers & emoji · paste a URL for clickable links
              </span>
            </div>

            {showStickers && (
              <div className="animate-pop mt-2 rounded-xl border border-white/10 bg-night-900 p-3">
                <input
                  className={`${input} mb-2`}
                  placeholder="Search stickers (token, e.g. wave)…"
                  value={stickerQuery}
                  onChange={(e) => setStickerQuery(e.target.value)}
                />
                {filteredStickers.length === 0 ? (
                  <p className="text-xs text-zinc-500">No stickers yet — ask an admin to add some.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {filteredStickers.map((s) => (
                      <button
                        type="button"
                        key={s.token}
                        title={`${s.token} — ${s.label || ''}`}
                        onClick={() => applyStickerToActiveLine(s.token)}
                        className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-lg hover:border-brand-400/60"
                      >
                        {s.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.url}
                            alt={s.label || s.token}
                            loading="lazy"
                            decoding="async"
                            className="h-8 w-8 object-contain"
                          />
                        ) : (
                          <span>{s.emoji ?? s.token}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className={label} htmlFor="language">
              Language
            </label>
            <select id="language" className={input} value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="expires">
              Expires in
            </label>
            <select id="expires" className={input} value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)}>
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="visibility">
              Visibility
            </label>
            <select
              id="visibility"
              className={input}
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'public' | 'unlisted')}
            >
              <option value="public">Public — listed</option>
              <option value="unlisted">Unlisted — link only</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className={input}
              placeholder="Optional lock"
              value={password}
              maxLength={64}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowOptions(!showOptions)}
            className="text-xs font-medium text-brand-300 hover:text-brand-200"
          >
            {showOptions ? '− Hide style options' : '+ Title color'}
          </button>
          {showOptions && (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Title color
              </label>
              <input
                type="color"
                value={titleColor || '#a78bfa'}
                onChange={(e) => setTitleColor(e.target.value)}
                className="h-8 w-12 cursor-pointer rounded border border-white/10 bg-transparent"
              />
              {titleColor && (
                <button
                  type="button"
                  onClick={() => setTitleColor('')}
                  className="text-xs text-zinc-400 hover:text-white"
                >
                  reset
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
          <span>
            {format === 'rich'
              ? `${rich.lines.reduce((s, l) => s + (l.text?.length ?? 0), 0).toLocaleString()} chars · links auto-clickable`
              : `${content.length.toLocaleString()} / 100,000`}
          </span>
        </div>

        {error && (
          <p className="animate-pop rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/40 transition-all hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
        >
          {busy ? 'Creating paste…' : 'Create paste'}
        </button>
        <p className="text-center text-xs text-zinc-500">
          The share link will be available on your dashboard after creation.
        </p>
      </div>
    </form>
  );
}

/** Renders one rich line as it will appear in the final paste. */
function PreviewLine({ line, pack }: { line: RichLine; pack: StickerEntry[] }) {
  const segments = splitLine(line, {
    renderSticker: (m, slice) => <StickerImage token={m.value} fallback={slice} pack={pack} />,
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
