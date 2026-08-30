import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { getSessionUser } from '@/lib/auth';

export const metadata: Metadata = { title: 'Log in' };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const session = await getSessionUser();
  if (session) redirect('/dashboard');
  const { next } = await searchParams;
  return <AuthForm mode="login" next={next ?? null} />;
}
