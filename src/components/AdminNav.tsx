'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const ITEMS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/tags', label: 'Tags' },
  { href: '/admin/stickers', label: 'Stickers' },
];

export default function AdminNav({ active }: { active?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/admin/login';
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
      <div className="flex flex-wrap items-center gap-1">
        {ITEMS.map((it) => {
          const on = active ? it.href === active : pathname === it.href;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                on ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {it.label}
            </Link>
          );
        })}
      </div>
      <button
        onClick={logout}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
      >
        Sign out
      </button>
    </div>
  );
}
