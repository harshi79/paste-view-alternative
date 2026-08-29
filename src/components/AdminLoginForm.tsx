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
        className="w-full rounded-xl border border-white/10 bg-night-800 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-amber-400/60 focus:ring-2 focus:ring-amber-500/20"
      />
      {error && (
        <p className="animate-pop rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !pw}
        className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 py-3 text-sm font-bold text-white shadow-lg shadow-rose-500/30 transition hover:brightness-110 disabled:opacity-50"
      >
        {busy ? 'Checking…' : 'Sign in'}
      </button>
    </form>
  );
}
