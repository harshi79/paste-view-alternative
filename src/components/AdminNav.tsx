'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const ITEMS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/tags', label: 'Tags' },
  { href: '/admin/stickers', label: 'Stickers' },
  { href: '/admin/notifications', label: 'Broadcast' },
  { href: '/admin/reservations', label: 'Reservations' },
];

export default function AdminNav({ active }: { active?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/admin/login';
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[color:var(--vb-line)] pb-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {ITEMS.map((it) => {
          const on = active ? it.href === active : pathname === it.href;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`rounded-md border-2 px-3 py-1.5 text-sm font-bold uppercase tracking-wide transition-all ${
                on
                  ? 'border-brand-400/70 bg-brand-600/25 text-white shadow-[2px_2px_0_0_var(--vb-ink)]'
                  : 'border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] text-zinc-400 hover:border-[#40404f] hover:text-white'
              }`}
            >
              {it.label}
            </Link>
          );
        })}
      </div>
      <button
        onClick={logout}
        className="rounded-md border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-zinc-300 transition-colors hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
      >
        Sign out
      </button>
    </div>
  );
}
