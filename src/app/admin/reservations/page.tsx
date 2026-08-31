import type { Metadata } from 'next';
import { asc } from 'drizzle-orm';
import { requireAdmin } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { usernameReservations } from '@/lib/db/schema';
import AdminNav from '@/components/AdminNav';
import ReservationsAdminClient from '@/components/ReservationsAdminClient';

export const metadata: Metadata = { title: 'Username Reservations · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminReservationsPage() {
  await requireAdmin();
  const db = await getDb();
  const rows = await db.select().from(usernameReservations).orderBy(asc(usernameReservations.username));
  return (
    <div className="pt-10">
      <AdminNav active="/admin/reservations" />
      <h1 className="mt-6 text-2xl font-black tracking-tight text-white">Username reservations</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Reserve usernames that normal users can never claim. Each reserved name points to a real
        owner profile it redirects to — no fake account is created.
      </p>
      <ReservationsAdminClient initial={rows} />
    </div>
  );
}
