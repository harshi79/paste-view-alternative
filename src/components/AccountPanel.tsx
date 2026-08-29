'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type Initial = {
  username: string;
  createdAt: string;
  usernameChangedAt: string | null;
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
    router.push('/');
    router.refresh();
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

  const input =
    'w-full rounded-xl border border-white/10 bg-night-800 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20';
  const label = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400';
  const card = 'rounded-2xl border border-white/10 bg-night-800/60 p-5 backdrop-blur';

  return (
    <div className="mx-auto max-w-2xl pt-10">
      <h1 className="mb-1 text-3xl font-black tracking-tight text-white">Account</h1>
      <p className="mb-8 text-sm text-zinc-400">Manage your identity and session.</p>

      <div className="space-y-5">
        <div className={card}>
          <h2 className="mb-4 font-bold text-white">Identity</h2>
          <p className="mb-3 text-sm text-zinc-400">
            Your current username is{' '}
            <span className="font-mono text-zinc-200">@{username}</span>.
          </p>

          {canRename ? (
            <form onSubmit={rename} className="space-y-2">
              <label className={label}>New username (one-time, within 24h of sign up)</label>
              <div className="flex gap-2">
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
                  className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-600/30 hover:brightness-110 disabled:opacity-60"
                >
                  {busy ? 'Saving…' : 'Rename'}
                </button>
              </div>
              <p className="text-xs text-zinc-500">
                {remaining(createdAt.getTime() + RENAME_WINDOW_MS)}
              </p>
            </form>
          ) : (
            <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-400">
              {alreadyRenamed
                ? 'You have already renamed your account. The username is now permanent.'
                : 'Your rename window has closed. The username is now permanent.'}
            </p>
          )}

          {msg && (
            <p className="mt-3 text-sm text-emerald-400">{msg}</p>
          )}
          {error && (
            <p className="mt-3 text-sm text-red-400">{error}</p>
          )}
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
            {pwError && <p className="text-sm text-red-400">{pwError}</p>}
            {pwMsg && <p className="animate-pop text-sm text-emerald-400">{pwMsg}</p>}
            <button
              type="submit"
              disabled={pwBusy || !currentPassword || !newPassword || !confirmPassword}
              className="rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-600/30 hover:brightness-110 disabled:opacity-60"
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
            className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-zinc-200 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
