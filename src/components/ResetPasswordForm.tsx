'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ResetPasswordForm({ initialToken }: { initialToken: string | null }) {
  const router = useRouter();
  const [token, setToken] = useState(initialToken ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!token.trim()) {
      setError('Enter the one-time code from your reset link.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), password }),
      });
      const data = await res.json();
      setBusy(false);
      if (!res.ok) {
        setError(data.error || 'Could not reset the password.');
        return;
      }
      setDone(true);
    } catch {
      setError('Network error. Try again.');
      setBusy(false);
    }
  }

  const input =
    'w-full rounded-xl border border-white/10 bg-night-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20';

  if (done) {
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <div className="animate-fade-up w-full max-w-md rounded-3xl border border-white/10 bg-night-800/60 p-8 text-center shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-400 text-xl shadow-lg shadow-emerald-600/30">
            ✅
          </div>
          <h1 className="text-2xl font-extrabold text-white">Password updated</h1>
          <p className="mt-2 text-sm text-zinc-400">
            You can now sign in with your new password. The reset link has been used and can no
            longer be reused.
          </p>
          <button
            onClick={() => {
              router.push('/login');
              router.refresh();
            }}
            className="mt-6 w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:brightness-110"
          >
            Go to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-[70vh] place-items-center">
      <div className="animate-fade-up w-full max-w-md">
        <div className="rounded-3xl border border-white/10 bg-night-800/60 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-cyan-400 text-xl shadow-lg shadow-brand-600/30">
              🔒
            </div>
            <h1 className="text-2xl font-extrabold text-white">Choose a new password</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Enter the one-time code from your reset link, then pick a secure new password (6+
              characters).
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                One-time code
              </label>
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste the reset code (e.g. vbpr_…)"
                autoComplete="one-time-code"
                className={`${input} font-mono text-xs`}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
                className={input}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat the new password"
                autoComplete="new-password"
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
              disabled={busy || !token || !password || !confirm}
              className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Set new password'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-zinc-400">
            Need a fresh link?{' '}
            <Link href="/forgot-password" className="font-semibold text-brand-300 hover:text-brand-200">
              Request one again
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
