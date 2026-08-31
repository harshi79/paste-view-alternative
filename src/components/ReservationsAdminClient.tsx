'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Reservation = {
  id: string;
  username: string;
  targetUsername: string;
  createdAt: Date | number | string;
};

const labelCls = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-400';

export default function ReservationsAdminClient({ initial }: { initial: Reservation[] }) {
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>(initial);
  const [username, setUsername] = useState('');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, targetUsername: target }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || 'Could not create reservation.');
      return;
    }
    setReservations((r) =>
      [...r, data.reservation].sort((a, b) => a.username.localeCompare(b.username)),
    );
    setUsername('');
    router.refresh();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remove the reservation for “${name}”? The username will be released.`)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/reservations?id=${id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.ok) {
      setReservations((r) => r.filter((x) => x.id !== id));
      router.refresh();
    }
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3">
        {reservations.length === 0 ? (
          <p className="rounded-lg border-2 border-dashed border-[color:var(--vb-line)] p-10 text-center text-zinc-500">
            No reservations yet. Reserve your first username on the right.
          </p>
        ) : (
          reservations.map((r) => (
            <div key={r.id} className="card flex items-center justify-between gap-3 p-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-mono text-sm font-bold text-white">/u/{r.username}</span>
                <span className="truncate font-mono text-xs text-zinc-500">
                  → redirects to @{r.targetUsername}
                </span>
              </div>
              <button
                onClick={() => remove(r.id, r.username)}
                disabled={busy}
                className="flex-none rounded-md border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-300 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      <form onSubmit={create} className="card h-fit p-5">
        <h2 className="mb-4 font-bold text-white">New reservation</h2>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Reserved username</label>
            <input
              className="input"
              value={username}
              maxLength={20}
              placeholder="e.g. vibebin"
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Owner profile it points to</label>
            <input
              className="input"
              value={target}
              maxLength={20}
              placeholder="existing @username"
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy || !username.trim() || !target.trim()}
            className="btn-primary w-full font-bold"
          >
            {busy ? 'Saving…' : 'Reserve username'}
          </button>
        </div>
      </form>
    </div>
  );
}
