import type { Metadata } from 'next';
import { sql } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import AdminNav from '@/components/AdminNav';
import BroadcastAdminClient from '@/components/BroadcastAdminClient';

export const metadata: Metadata = { title: 'Broadcast · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminBroadcastPage() {
  await requireAdmin();
  const db = await getDb();
  const [u] = await db.select({ n: sql<number>`count(*)` }).from(users);
  return (
    <div className="pt-10">
      <AdminNav active="/admin/notifications" />
      <h1 className="mt-6 text-2xl font-black tracking-tight text-white">Broadcast</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Send one notification to every registered user. Recipients see it in their notification bell
        and on /notifications.
      </p>
      <BroadcastAdminClient userCount={Number(u?.n ?? 0)} />
    </div>
  );
}
