'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
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
    window.location.href = isRegister ? '/settings' : '/dashboard';
  }

  return (
    <div className="grid min-h-[75vh] place-items-center py-8">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1fr_420px] lg:items-center">
        <div className="hidden lg:block">
          <p className="eyebrow">Welcome to VibeBin</p>
          <h1 className="mt-4 max-w-xl text-5xl font-black tracking-tight text-white">
            A better home for pastes and developer profiles.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-8 text-zinc-400">
            The workflow stays simple: sign in to keep paste history, customize your public profile,
            and manage links, expiration, and formatting from a cohesive dashboard.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <span className="pill">Unified editor</span>
            <span className="pill">Paste history</span>
            <span className="pill">Custom profile studio</span>
          </div>
        </div>

        <div className="animate-fade-up w-full">
          <div className="card rounded-[30px] p-8 shadow-2xl shadow-black/40">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-cyan-400 shadow-lg shadow-brand-600/30">
                <svg viewBox="0 0 20 20" fill="none" className="h-6 w-6 text-white" aria-hidden="true">
                  <path d="M10 2.5 11.6 7 16 8.6 11.6 10.2 10 14.7 8.4 10.2 4 8.6 8.4 7 10 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M15.5 13.5v3.5M13.75 15.25h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <p className="eyebrow justify-center">Account access</p>
              <h1 className="mt-4 text-3xl font-black tracking-tight text-white">
                {isRegister ? 'Create your account' : 'Sign in'}
              </h1>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {isRegister
                  ? 'No email required. Signing up unlocks saved pastes and your customizable public profile.'
                  : 'Sign in to manage your pastes, profile, and account settings.'}
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Username
                </label>
                <input
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                  autoComplete="username"
                  className="input"
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Password
                  </label>
                  {!isRegister && (
                    <Link href="/forgot-password" className="text-xs font-semibold text-brand-300 hover:text-brand-200">
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
                  className="input"
                />
              </div>

              {error && (
                <p className="animate-pop rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {error}
                </p>
              )}

              <button type="submit" disabled={busy || !username || !password} className="btn-primary w-full justify-center py-3 text-sm">
                {busy ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-zinc-400">
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
              Demo account: <span className="font-mono text-zinc-400">demo / demo1234</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
