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
    return richDoc ? <RichPasteViewClient doc={richDoc} /> : <PasteViewerClient content={unlocked.content} language={unlocked.language} />;
  }

  return (
    <form onSubmit={submit} className="card animate-pop mx-auto max-w-lg rounded-[28px] p-8 text-center shadow-2xl shadow-black/40">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-brand-500/30 to-cyan-400/20 text-2xl">
        🔒
      </div>
      <p className="eyebrow justify-center">Protected paste</p>
      <h2 className="mt-4 text-2xl font-black tracking-tight text-white">Unlock to view</h2>
      <p className="mb-6 mt-2 text-sm leading-6 text-zinc-400">
        This paste uses password protection. Enter the password below to fetch and render its
        contents.
      </p>
      <input
        type="password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        className="input"
      />
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={busy || !password} className="btn-primary mt-4 w-full justify-center py-3 text-sm">
        {busy ? 'Unlocking…' : 'Unlock paste'}
      </button>
    </form>
  );
}
