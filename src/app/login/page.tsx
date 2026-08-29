import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { getSessionUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Log in' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getSessionUser();
  if (session) redirect('/dashboard');
  return <AuthForm mode="login" />;
}
