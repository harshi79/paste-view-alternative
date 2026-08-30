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

  if (done) {
    return (
      <div className="grid min-h-[75vh] place-items-center py-8">
        <div className="card animate-fade-up w-full max-w-md rounded-[30px] p-8 text-center shadow-2xl shadow-black/40">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-400 text-xl shadow-lg shadow-emerald-600/30">
            ✅
          </div>
          <p className="eyebrow justify-center">Password updated</p>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-white">All set</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            You can now sign in with your new password. The reset link has been used and can no
            longer be reused.
          </p>
          <button
            onClick={() => {
              router.push('/login');
              router.refresh();
            }}
            className="btn-primary mt-6 w-full justify-center py-3 text-sm"
          >
            Go to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-[75vh] place-items-center py-8">
      <div className="animate-fade-up w-full max-w-lg">
        <div className="card rounded-[30px] p-8 shadow-2xl shadow-black/40">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-cyan-400 text-xl shadow-lg shadow-brand-600/30">
              🔒
            </div>
            <p className="eyebrow justify-center">Choose a new password</p>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white">Secure your account</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Enter the one-time code from your reset link, then pick a secure new password.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                One-time code
              </label>
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste the reset code (e.g. vbpr_…)"
                autoComplete="one-time-code"
                className="input font-mono text-xs"
              />
            </div>
            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
                className="input"
              />
            </div>
            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Confirm new password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Repeat the new password"
                autoComplete="new-password"
                className="input"
              />
            </div>

            {error && <p className="animate-pop rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}

            <button type="submit" disabled={busy || !token || !password || !confirm} className="btn-primary w-full justify-center py-3 text-sm">
              {busy ? 'Saving…' : 'Set new password'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-400">
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
