import type { Metadata } from 'next';
import { asc } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { stickers } from '@/lib/db/schema';
import AdminNav from '@/components/AdminNav';
import StickersAdminClient from '@/components/StickersAdminClient';

export const metadata: Metadata = { title: 'Stickers · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminStickersPage() {
  await requireAdmin();
  const db = await getDb();
  const rows = await db.select().from(stickers).orderBy(asc(stickers.token));
  return (
    <div className="pt-10">
      <AdminNav active="/admin/stickers" />
      <h1 className="mt-6 text-2xl font-black tracking-tight text-white">Stickers</h1>
      <p className="mt-1 text-sm text-zinc-400">
        The rich editor inserts stickers by typing their token (e.g. <code>:wave:</code>). Add a URL
        to render an animated image, or leave it empty and provide a fallback emoji.
      </p>
      <StickersAdminClient initial={rows} />
    </div>
  );
}
