import type { Metadata } from 'next';
import ResetPasswordForm from '@/components/ResetPasswordForm';

export const metadata: Metadata = { title: 'Reset password' };

type Props = { searchParams: Promise<{ token?: string }> };

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token } = await searchParams;
  return <ResetPasswordForm initialToken={token ?? null} />;
}
