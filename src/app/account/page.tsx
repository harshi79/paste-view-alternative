import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { requireUser } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { emailVerifications } from '@/lib/db/schema';
import AccountPanel from '@/components/AccountPanel';

export const metadata: Metadata = { title: 'Account' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const { user } = await requireUser();
  const createdAt = user.createdAt.toISOString();
  const usernameChangedAt = (user as { usernameChangedAt?: Date | null }).usernameChangedAt
    ? ((user as { usernameChangedAt?: Date | null }).usernameChangedAt as Date).toISOString()
    : null;

  const db = await getDb();
  const [emailRow] = await db
    .select()
    .from(emailVerifications)
    .where(eq(emailVerifications.userId, user.id))
    .limit(1);
  const recoveryEmail = emailRow
    ? { email: emailRow.email, verified: emailRow.emailVerified }
    : null;

  return (
    <AccountPanel
      initial={{
        username: user.username,
        createdAt,
        usernameChangedAt,
        recoveryEmail,
      }}
    />
  );
}
