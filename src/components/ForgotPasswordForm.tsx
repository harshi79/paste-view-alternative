'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordForm() {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [generic, setGeneric] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setGeneric(false);
    setResetToken(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Try again.');
        setBusy(false);
        return;
      }
      setBusy(false);
      if (data.resetToken) {
        setResetToken(data.resetToken as string);
      } else {
        setGeneric(true);
      }
    } catch {
      setError('Network error. Try again.');
      setBusy(false);
    }
  }

  const input =
    'w-full rounded-xl border border-white/10 bg-night-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20';

  return (
    <div className="grid min-h-[70vh] place-items-center">
      <div className="animate-fade-up w-full max-w-md">
        <div className="rounded-3xl border border-white/10 bg-night-800/60 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-cyan-400 text-xl shadow-lg shadow-brand-600/30">
              🔑
            </div>
            <h1 className="text-2xl font-extrabold text-white">Reset your password</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Enter your username. A one-time reset link (valid 30 minutes) will be generated for
              this device.
            </p>
          </div>

          {resetToken ? (
            <div className="space-y-4">
              <p className="animate-pop rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                Reset link generated. Open it on this device, or copy the one-time code below.
                The link expires in 30 minutes and can be used only once.
              </p>
              <Link
                href={`/reset-password?token=${encodeURIComponent(resetToken)}`}
                className="block w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 py-3 text-center text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:brightness-110"
              >
                Open reset link
              </Link>
              <div className="rounded-xl border border-white/10 bg-night-900/80 px-4 py-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  One-time code
                </p>
                <p className="break-all font-mono text-xs text-zinc-300">{resetToken}</p>
              </div>
              <p className="text-center text-xs text-zinc-500">
                Don&apos;t have access to this device?{' '}
                <Link href="/reset-password" className="font-semibold text-brand-300 hover:text-brand-200">
                  Enter the code manually
                </Link>
              </p>
            </div>
          ) : generic ? (
            <div className="space-y-4">
              <p className="animate-pop rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
                If an account exists for <span className="font-semibold">@{username}</span>, a reset
                link was generated for this device. Refresh this page to see it.
              </p>
              <Link
                href="/login"
                className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 text-center text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
              >
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Username
                </label>
                <input
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="coolname_123"
                  autoComplete="username"
                  className={input}
                />
              </div>

              {error && (
                <p className="animate-pop rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy || !username}
                className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:brightness-110 disabled:opacity-50"
              >
                {busy ? 'Please wait…' : 'Generate reset link'}
              </button>
            </form>
          )}

          <p className="mt-5 text-center text-sm text-zinc-400">
            Remembered it?{' '}
            <Link href="/login" className="font-semibold text-brand-300 hover:text-brand-200">
              Back to login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
