'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginForm() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Wrong password.');
      return;
    }
    window.location.href = '/admin';
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <input
        type="password"
        autoFocus
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        placeholder="Admin password"
        className="w-full rounded-md border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-inset)] px-4 py-2.5 text-sm text-zinc-100 outline-none transition-colors focus:border-amber-400/80"
      />
      {error && (
        <p className="animate-pop rounded-md border-2 border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !pw}
        className="w-full rounded-md border-2 border-[#0c0c13] bg-amber-500 py-3 text-sm font-black uppercase tracking-wide text-black shadow-[4px_4px_0_0_var(--vb-ink)] transition-all hover:-translate-x-px hover:-translate-y-px hover:bg-amber-400 hover:shadow-[5px_5px_0_0_var(--vb-ink)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_0_var(--vb-ink)] disabled:opacity-50"
      >
        {busy ? 'Checking…' : 'Sign in'}
      </button>
    </form>
  );
}
