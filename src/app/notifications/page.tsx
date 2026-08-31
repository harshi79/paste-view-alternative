import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import NotificationCenter from '@/components/NotificationCenter';

export const metadata: Metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  // Keep this page on the same server-side auth convention as the other
  // account pages. The client component then talks directly to the existing
  // notification endpoints for its data and mutations.
  await requireUser();
  return <NotificationCenter />;
}
