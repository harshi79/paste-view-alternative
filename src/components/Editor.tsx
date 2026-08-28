'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LANGUAGES } from '@/lib/languages';
import { EXPIRY_OPTIONS } from '@/lib/expiry';

type Props = { username: string | null };

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!content.trim()) {
      setError('Paste content is required.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/pastes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || 'Untitled',
          content,
          language,
          visibility,
          expiresIn,
          password: password || undefined,
          titleColor: titleColor || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Try again.');
        setBusy(false);
        return;
      }
      router.push(`/p/${data.id}`);
    } catch {
      setError('Network error. Try again.');
      setBusy(false);
    }
  }

  const input =
    'w-full rounded-xl border border-white/10 bg-night-800/80 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20';
  const label = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400';

  return (
    <form
      onSubmit={submit}
      className="animate-fade-up rounded-2xl border border-white/10 bg-night-800/60 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
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

      <div className="space-y-4">
        <div>
          <label className={label} htmlFor="title">
            Title
          </label>
          <input
            id="title"
            className={input}
            placeholder="My awesome snippet (optional)"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className={`${label} mb-0`} htmlFor="content">
              Content
            </label>
            <span className="text-xs text-zinc-500">{content.length.toLocaleString()} / 100,000</span>
          </div>
          <textarea
            id="content"
            className={`${input} min-h-[240px] resize-y font-mono text-[13px] leading-relaxed`}
            placeholder={'Paste your code or text here…'}
            value={content}
            maxLength={100000}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
          />
        </div>

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
              placeholder="Optional lock 🔒"
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
            {showOptions ? '− Hide style options' : '+ Style options (title color)'}
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
          {busy ? 'Creating paste…' : 'Create paste ⚡'}
        </button>
      </div>
    </form>
  );
}
