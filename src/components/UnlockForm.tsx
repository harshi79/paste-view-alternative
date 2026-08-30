'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { parsePasteContent, isRichDoc } from '@/lib/pasteFormat';

// Loaded only after the visitor unlocks a protected paste — keeps
// highlight.js out of the initial bundle of the paste page.
const PasteViewerClient = dynamic(() => import('./PasteViewerClient'), {
  ssr: false,
  loading: () => <div className="py-10 text-center text-sm text-zinc-500">Unlocking…</div>,
});

// Unified (rich-doc) pastes render through the same viewer the public
// paste page uses; stickers resolve via the shared client-side pack loader.
const RichPasteViewClient = dynamic(() => import('./RichPasteView'), {
  ssr: false,
  loading: () => <div className="py-10 text-center text-sm text-zinc-500">Unlocking…</div>,
});

type Unlocked = { content: string; language: string; format: string };

/** Password gate for protected pastes — content is only fetched after unlock. */
export default function UnlockForm({ pasteId }: { pasteId: string }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [unlocked, setUnlocked] = useState<Unlocked | null>(null);

  // Same dispatch as the paste page: 'rich' rows that parse as a valid
  // RichDoc go to the rich renderer, everything else (legacy 'plain' rows,
  // or malformed rich rows) falls back to the plain viewer.
  const richDoc = useMemo(() => {
    if (!unlocked) return null;
    const parsed = parsePasteContent(unlocked.format, unlocked.content);
    return isRichDoc(parsed) ? parsed : null;
  }, [unlocked]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch(`/api/pastes/${pasteId}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Wrong password.');
      return;
    }
    setUnlocked({ content: data.content, language: data.language, format: data.format ?? 'plain' });
  }

  if (unlocked) {
    return richDoc ? (
      <RichPasteViewClient doc={richDoc} />
    ) : (
      <PasteViewerClient content={unlocked.content} language={unlocked.language} />
    );
  }

  return (
    <form
      onSubmit={submit}
      className="animate-pop mx-auto max-w-md rounded-2xl border border-white/10 bg-night-800/60 p-8 text-center shadow-2xl shadow-black/40"
    >
      <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500/30 to-cyan-400/20 text-2xl">
        🔒
      </div>
      <h2 className="text-lg font-bold text-white">This paste is protected</h2>
      <p className="mt-1 mb-5 text-sm text-zinc-400">Enter the password to view its contents.</p>
      <input
        type="password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="w-full rounded-xl border border-white/10 bg-night-800 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20"
      />
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy || !password}
        className="mt-4 w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:brightness-110 disabled:opacity-50"
      >
        {busy ? 'Unlocking…' : 'Unlock'}
      </button>
    </form>
  );
}
