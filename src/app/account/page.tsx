import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import AccountPanel from '@/components/AccountPanel';

export const metadata: Metadata = { title: 'Account' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const { user } = await requireUser();
  const createdAt = user.createdAt.toISOString();
  const usernameChangedAt = (user as { usernameChangedAt?: Date | null }).usernameChangedAt
    ? ((user as { usernameChangedAt?: Date | null }).usernameChangedAt as Date).toISOString()
    : null;
  return (
    <AccountPanel
      initial={{ username: user.username, createdAt, usernameChangedAt }}
    />
  );
}
