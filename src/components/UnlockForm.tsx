'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { parsePasteContent, isRichDoc } from '@/lib/pasteFormat';

const PasteViewerClient = dynamic(() => import('./PasteViewerClient'), {
  ssr: false,
  loading: () => <div className="py-10 text-center text-sm text-zinc-500">Unlocking…</div>,
});

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
    <div className="card animate-pop mx-auto max-w-md rounded-[26px] p-5 text-center shadow-2xl shadow-black/40 sm:p-7">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-brand-500/20 to-cyan-400/20 text-2xl sm:h-14 sm:w-14">
        🔒
      </div>
      <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Password protected</h2>
      <p className="mb-6 mt-2 text-sm leading-6 text-zinc-400">
        Enter the password to view this paste.
      </p>
      <form onSubmit={submit} className="space-y-4">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="input text-center"
        />
        {error && <p className="feedback-error text-left">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="btn-primary w-full justify-center py-2.5 text-sm font-semibold"
        >
          {busy ? 'Unlocking…' : 'Unlock paste'}
        </button>
      </form>
    </div>
  );
}
