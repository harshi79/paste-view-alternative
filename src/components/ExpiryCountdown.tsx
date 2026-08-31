'use client';

import { useEffect, useState } from 'react';

function fmt(ms: number): string {
  if (ms <= 0) return 'expired';
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Live countdown shown next to expiring pastes. */
export default function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const target = new Date(expiresAt).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const label = now === null ? fmt(target - Date.now()) : fmt(target - now);
  const soon = now !== null && target - now < 60 * 60 * 1000;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2.5 py-1 font-mono text-xs font-semibold ${
        soon ? 'border-red-500/50 bg-red-500/10 text-red-300' : 'border-amber-500/50 bg-amber-500/10 text-amber-200'
      }`}
      title="This paste auto-deletes when the timer runs out"
    >
      ⏳ {label === 'expired' ? 'expired' : `expires in ${label}`}
    </span>
  );
}
