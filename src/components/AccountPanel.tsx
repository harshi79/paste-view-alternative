'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Initial = {
  username: string;
  createdAt: string;
  usernameChangedAt: string | null;
  recoveryEmail: { email: string; verified: boolean } | null;
};

const RENAME_WINDOW_MS = 24 * 60 * 60 * 1000;

function remaining(until: number) {
  const ms = until - Date.now();
  if (ms <= 0) return 'window closed';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m left to rename`;
}

export default function AccountPanel({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [username, setUsername] = useState(initial.username);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState(initial.recoveryEmail);
  const [newEmail, setNewEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [reBusy, setReBusy] = useState(false);
  const [reError, setReError] = useState('');
  const [reMsg, setReMsg] = useState('');

  const alreadyRenamed = !!initial.usernameChangedAt;
  const createdAt = new Date(initial.createdAt);
  const inWindow = Date.now() - createdAt.getTime() < RENAME_WINDOW_MS;
  const canRename = !alreadyRenamed && inWindow;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  void tick;

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    setBusy(true);
    const res = await fetch('/api/account/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newName }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Could not rename.');
      return;
    }
    setUsername(data.username);
    setMsg('Username updated.');
    setNewName('');
    router.refresh();
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError('');
    setPwMsg('');
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setPwError('New password must be at least 6 characters.');
      return;
    }
    setPwBusy(true);
    const res = await fetch('/api/account/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    setPwBusy(false);
    if (!res.ok) {
      setPwError(data.error || 'Could not change the password.');
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPwMsg('Password updated. Use the new password next time you sign in.');
  }

  async function sendRecoveryOtp(e: React.FormEvent) {
    e.preventDefault();
    setReError('');
    setReMsg('');
    setOtpSent(false);
    setOtpCode('');
    if (!newEmail) return;
    setReBusy(true);
    const res = await fetch('/api/auth/email-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purpose: 'verify', email: newEmail }),
    });
    const data = await res.json();
    setReBusy(false);
    if (!res.ok) {
      setReError(data.error || 'Could not send the code. Try again.');
      return;
    }
    setOtpSent(true);
    setReMsg(`A 6-digit code was sent to ${newEmail}. It expires in 10 minutes.`);
  }

  async function verifyRecoveryOtp(e: React.FormEvent) {
    e.preventDefault();
    setReError('');
    setReBusy(true);
    const res = await fetch('/api/auth/email-otp/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purpose: 'verify', code: otpCode }),
    });
    const data = await res.json();
    setReBusy(false);
    if (!res.ok) {
      setReError(data.error || 'Could not verify the code.');
      return;
    }
    setRecoveryEmail({ email: data.email, verified: true });
    setNewEmail('');
    setOtpCode('');
    setOtpSent(false);
    setReMsg(`Recovery email verified: ${data.email}`);
    router.refresh();
  }

  const input = 'input';
  const label = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500';
  const card = 'card rounded-[26px] p-5 sm:p-6';

  return (
    <div className="mx-auto max-w-4xl pt-4 sm:pt-6">
      <div className="card mb-6 rounded-[28px] px-5 py-5 sm:px-6 sm:py-6">
        <p className="eyebrow">Account</p>
        <h1 className="mt-4 text-2xl font-black tracking-tight text-white sm:text-4xl">
          Identity & security
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
          Update your username when eligible, manage recovery access, rotate passwords, and sign out
          from this device — without changing any of the existing account rules.
        </p>
      </div>

      <div className="space-y-5">
        <div className={card}>
          <h2 className="mb-4 font-bold text-white">Identity</h2>
          <p className="mb-3 text-sm text-zinc-400">
            Your current username is <span className="font-mono text-zinc-200">@{username}</span>.
          </p>

          {canRename ? (
            <form onSubmit={rename} className="space-y-3">
              <label className={label}>New username (one-time, within 24h of sign up)</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className={input}
                  placeholder="new_handle"
                  value={newName}
                  maxLength={20}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={busy || !newName}
                  className="btn-primary w-full shrink-0 px-5 py-2.5 text-sm disabled:opacity-60 sm:w-auto"
                >
                  {busy ? 'Saving…' : 'Rename'}
                </button>
              </div>
              <p className="text-xs text-zinc-500">{remaining(createdAt.getTime() + RENAME_WINDOW_MS)}</p>
            </form>
          ) : (
            <p className="feedback-note">
              {alreadyRenamed
                ? 'You have already renamed your account. The username is now permanent.'
                : 'Your rename window has closed. The username is now permanent.'}
            </p>
          )}

          {msg && <p className="feedback-success mt-3 animate-pop">{msg}</p>}
          {error && <p className="feedback-error mt-3 animate-pop">{error}</p>}
        </div>

        <div className={card}>
          <h2 className="mb-4 font-bold text-white">Recovery email</h2>
          <p className="mb-3 text-sm text-zinc-400">
            Used for password recovery when you can&apos;t sign in. A one-time code is sent to the
            email to verify it — it only becomes your recovery email after a successful code.
          </p>

          {recoveryEmail && (
            <p className="feedback-note mb-4">
              Current: <span className="font-mono text-zinc-100">{recoveryEmail.email}</span>{' '}
              {recoveryEmail.verified ? (
                <span className="text-emerald-400">✓ verified</span>
              ) : (
                <span className="text-amber-400">— pending verification</span>
              )}
            </p>
          )}

          <form onSubmit={otpSent ? verifyRecoveryOtp : sendRecoveryOtp} className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className={input}
                type="email"
                placeholder="you@example.com"
                value={newEmail}
                maxLength={254}
                disabled={otpSent}
                onChange={(e) => setNewEmail(e.target.value)}
              />
              {!otpSent && (
                <button
                  type="submit"
                  disabled={reBusy || !newEmail}
                  className="btn-primary w-full shrink-0 px-5 py-2.5 text-sm disabled:opacity-60 sm:w-auto"
                >
                  {reBusy ? 'Sending…' : 'Send code'}
                </button>
              )}
            </div>
            {otpSent && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className={input}
                  inputMode="numeric"
                  placeholder="6-digit code"
                  value={otpCode}
                  maxLength={6}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                />
                <button
                  type="submit"
                  disabled={reBusy || otpCode.length !== 6}
                  className="btn-primary w-full shrink-0 px-5 py-2.5 text-sm disabled:opacity-60 sm:w-auto"
                >
                  {reBusy ? 'Verifying…' : 'Verify'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtpCode('');
                  }}
                  className="btn-ghost w-full shrink-0 px-4 py-2.5 text-sm sm:w-auto"
                >
                  Back
                </button>
              </div>
            )}
            {reMsg && <p className="feedback-success animate-pop">{reMsg}</p>}
            {reError && <p className="feedback-error animate-pop">{reError}</p>}
          </form>
        </div>

        <div className={card}>
          <h2 className="mb-4 font-bold text-white">Password</h2>
          <p className="mb-4 text-sm text-zinc-400">
            Confirm your current password to set a new one. Forgot it? Use the reset link on the
            login screen.
          </p>
          <form onSubmit={changePassword} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                type="password"
                className={input}
                placeholder="Current password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <input
                type="password"
                className={input}
                placeholder="New password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <input
                type="password"
                className={input}
                placeholder="Confirm new password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {pwError && <p className="feedback-error animate-pop">{pwError}</p>}
            {pwMsg && <p className="feedback-success animate-pop">{pwMsg}</p>}
            <button
              type="submit"
              disabled={pwBusy || !currentPassword || !newPassword || !confirmPassword}
              className="btn-primary w-full px-5 py-2.5 text-sm disabled:opacity-60 sm:w-auto"
            >
              {pwBusy ? 'Updating…' : 'Change password'}
            </button>
          </form>
        </div>

        <div className={card}>
          <h2 className="mb-4 font-bold text-white">Session</h2>
          <p className="mb-4 text-sm text-zinc-400">
            Logging out clears the cookie on this device. You can sign back in any time.
          </p>
          <button
            onClick={logout}
            className="btn-ghost w-full px-5 py-2.5 text-sm hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 sm:w-auto"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
