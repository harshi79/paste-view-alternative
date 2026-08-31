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

  return (
    <div className="grid min-h-[72vh] place-items-center py-6 sm:py-8">
      <div className="animate-fade-up w-full max-w-lg">
        <div className="card rounded-xl p-6 sm:p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-md border-2 border-[#0c0c13] bg-brand-600 text-xl shadow-[4px_4px_0_0_var(--vb-ink)] sm:h-14 sm:w-14">
              🔑
            </div>
            <p className="eyebrow justify-center">Password recovery</p>
            <h1 className="mt-4 text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
              Reset your password
            </h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              {stage === 'code'
                ? 'Enter the 6-digit code sent to the recovery email.'
                : 'Enter your username or recovery email to continue.'}
            </p>
          </div>

          {stage === 'token' && resetToken ? (
            <div className="space-y-4">
              <p className="feedback-success animate-pop">
                Reset link generated. Open it on this device, or copy the one-time code below. The
                link expires in 30 minutes and can be used only once.
              </p>
              <Link
                href={`/reset-password?token=${encodeURIComponent(resetToken)}`}
                className="btn-primary flex w-full justify-center py-3 text-sm uppercase tracking-wide"
              >
                Open reset link
              </Link>
              <div className="surface-subtle rounded-lg px-4 py-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
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
              <p className="feedback-note">
                If <span className="font-semibold">{looksLikeEmail ? identifier : `@${identifier}`}</span>{' '}
                has a verified recovery email, a 6-digit code was just sent there. Codes expire in
                10 minutes and work only once.
              </p>
              <div>
                <label className="mb-2 block font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                  6-digit code
                </label>
                <input
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  className="input"
                />
              </div>
              {error && <p className="feedback-error animate-pop">{error}</p>}
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="btn-primary w-full justify-center py-3 text-sm uppercase tracking-wide"
              >
                {busy ? 'Please wait…' : 'Verify code'}
              </button>
              <p className="text-xs leading-6 text-zinc-500">
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
                className="btn-ghost w-full justify-center py-3 text-sm uppercase tracking-wide"
              >
                Use a different username or email
              </button>
            </form>
          ) : (
            <form onSubmit={request} className="space-y-4">
              <div>
                <label className="mb-2 block font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                  Username or recovery email
                </label>
                <input
                  autoFocus
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="username or you@example.com"
                  autoComplete="username"
                  className="input"
                />
              </div>

              {error && <p className="feedback-error animate-pop">{error}</p>}

              <button
                type="submit"
                disabled={busy || !identifier.trim()}
                className="btn-primary w-full justify-center py-3 text-sm uppercase tracking-wide"
              >
                {busy ? 'Please wait…' : 'Send recovery code'}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-zinc-400">
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
