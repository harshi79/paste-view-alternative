'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await fetch(`/api/auth/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Something went wrong.');
      setBusy(false);
      return;
    }
    router.push(isRegister ? '/settings' : '/dashboard');
    router.refresh();
  }

  const input =
    'w-full rounded-xl border border-white/10 bg-night-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20';

  return (
    <div className="grid min-h-[70vh] place-items-center">
      <div className="animate-fade-up w-full max-w-md">
        <div className="rounded-3xl border border-white/10 bg-night-800/60 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-cyan-400 text-xl shadow-lg shadow-brand-600/30">
              ⚡
            </div>
            <h1 className="text-2xl font-extrabold text-white">
              {isRegister ? 'Create an account' : 'Sign in'}
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              {isRegister
                ? 'Free, no email required. Unlocks profile customization and paste history.'
                : 'Sign in to manage your pastes and profile.'}
            </p>
          </div>

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
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Password
                </label>
                {!isRegister && (
                  <Link
                    href="/forgot-password"
                    className="text-xs font-medium text-brand-300 hover:text-brand-200"
                  >
                    Forgot password?
                  </Link>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isRegister ? 'At least 6 characters' : 'Your password'}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
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
              disabled={busy || !username || !password}
              className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:brightness-110 disabled:opacity-50"
            >
              {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-zinc-400">
            {isRegister ? (
              <>
                Already have an account?{' '}
                <Link href="/login" className="font-semibold text-brand-300 hover:text-brand-200">
                  Log in
                </Link>
              </>
            ) : (
              <>
                New here?{' '}
                <Link href="/register" className="font-semibold text-brand-300 hover:text-brand-200">
                  Create an account
                </Link>
              </>
            )}
          </p>
        </div>

        {!isRegister && (
          <p className="mt-4 text-center text-xs text-zinc-500">
            Try the demo: <span className="font-mono text-zinc-400">demo / demo1234</span>
          </p>
        )}
      </div>
    </div>
  );
}
