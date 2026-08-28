import type { Metadata } from 'next';
import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { users, pastes, tags, stickers } from '@/lib/db/schema';
import AdminNav from '@/components/AdminNav';

export const metadata: Metadata = { title: 'Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  await requireAdmin();
  const db = await getDb();

  const [u] = await db.select({ n: sql<number>`count(*)` }).from(users);
  const [p] = await db.select({ n: sql<number>`count(*)` }).from(pastes);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(tags);
  const [s] = await db.select({ n: sql<number>`count(*)` }).from(stickers);
  const [v] = await db
    .select({ n: sql<number>`coalesce(sum(${pastes.views}), 0)` })
    .from(pastes);

  return (
    <div className="pt-10">
      <AdminNav active="home" />
      <h1 className="mt-8 text-3xl font-black tracking-tight text-white">Admin</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Operate the site: assign tags to users, manage the tag library, and curate the sticker pack.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Users" value={Number(u?.n ?? 0)} />
        <Stat label="Pastes" value={Number(p?.n ?? 0)} />
        <Stat label="Total views" value={Number(v?.n ?? 0)} />
        <Stat label="Tags" value={Number(t?.n ?? 0)} />
      </div>

      <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          href="/admin/users"
          className="rounded-2xl border border-white/10 bg-night-800/60 p-5 transition hover:border-brand-400/40"
        >
          <h3 className="font-bold text-white">Users</h3>
          <p className="mt-1 text-sm text-zinc-400">Search accounts and assign tags.</p>
        </Link>
        <Link
          href="/admin/tags"
          className="rounded-2xl border border-white/10 bg-night-800/60 p-5 transition hover:border-brand-400/40"
        >
          <h3 className="font-bold text-white">Tags</h3>
          <p className="mt-1 text-sm text-zinc-400">Create the tags you can award.</p>
        </Link>
        <Link
          href="/admin/stickers"
          className="rounded-2xl border border-white/10 bg-night-800/60 p-5 transition hover:border-brand-400/40"
        >
          <h3 className="font-bold text-white">Stickers</h3>
          <p className="mt-1 text-sm text-zinc-400">
            Curate the {Number(s?.n ?? 0)} sticker(s) the rich editor offers.
          </p>
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-night-800/60 p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-white">{value.toLocaleString()}</p>
    </div>
  );
}
