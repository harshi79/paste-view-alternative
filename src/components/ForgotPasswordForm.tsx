'use client';

import { useState } from 'react';
import Link from 'next/link';

type Stage = 'request' | 'code' | 'token';

export default function ForgotPasswordForm() {
  const [identifier, setIdentifier] = useState('');
  const [stage, setStage] = useState<Stage>('request');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const looksLikeEmail = identifier.includes('@');

  async function request(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setResetToken(null);
    setCode('');
    setBusy(true);
    try {
      // 1) Signed-in device path (unchanged): if this browser is signed in
      //    to the very account named, a one-time reset link is generated
      //    here immediately — no email involved.
      if (!looksLikeEmail) {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: identifier }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.resetToken) {
            setResetToken(data.resetToken as string);
            setStage('token');
            setBusy(false);
            return;
          }
        }
      }
      // 2) Recovery-email path: a 6-digit code is sent to the account's
      //    verified recovery email (if one exists). The response is
      //    uniform, so this step reveals nothing about the account.
      const body = looksLikeEmail
        ? { purpose: 'recovery', email: identifier }
        : { purpose: 'recovery', username: identifier };
      const res = await fetch('/api/auth/email-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setBusy(false);
      if (!res.ok) {
        setError(data.error || 'Too many requests. Try again in a few minutes.');
        return;
      }
      setStage('code');
    } catch {
      setError('Network error. Try again.');
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = {
        purpose: 'recovery',
        code,
        ...(looksLikeEmail ? { email: identifier } : { username: identifier }),
      };
      const res = await fetch('/api/auth/email-otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setBusy(false);
      if (res.ok && data.resetToken) {
        setResetToken(data.resetToken as string);
        setStage('token');
      } else {
        setError('The code is incorrect, expired, or was already used. Request a new one.');
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
            <h1 className="text-2xl font-extrubold text-white">Reset your password</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {stage === 'code'
                ? 'Enter the 6-digit code sent to the recovery email.'
                : 'Enter your username or recovery email.'}
            </p>
          </div>

          {stage === 'token' && resetToken ? (
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
          ) : stage === 'code' ? (
            <form onSubmit={submitCode} className="space-y-4">
              <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
                If <span className="font-semibold">{looksLikeEmail ? identifier : `@${identifier}`}</span>{' '}
                has a verified recovery email, a 6-digit code was just sent there. Codes expire
                in 10 minutes and work only once.
              </p>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  6-digit code
                </label>
                <input
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
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
                disabled={busy || code.length !== 6}
                className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:brightness-110 disabled:opacity-50"
              >
                {busy ? 'Please wait…' : 'Verify code'}
              </button>
              <p className="text-xs leading-relaxed text-zinc-500">
                No code arrived? If you are signed in to the account on this device, go back and
                request again — a reset link is generated instantly. Otherwise, verify a recovery
                email in Account settings first.
              </p>
              <button
                type="button"
                onClick={() => {
                  setStage('request');
                  setError('');
                  setCode('');
                }}
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 text-sm font-semibold text-zinc-300 transition hover:bg-white/10"
              >
                Use a different username or email
              </button>
            </form>
          ) : (
            <form onSubmit={request} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Username or recovery email
                </label>
                <input
                  autoFocus
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="username or you@example.com"
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
                disabled={busy || !identifier.trim()}
                className="w-full rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:brightness-110 disabled:opacity-50"
              >
                {busy ? 'Please wait…' : 'Send recovery code'}
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
