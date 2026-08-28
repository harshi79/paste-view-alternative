import type { Metadata } from 'next';
import AuthForm from '@/components/AuthForm';

export const metadata: Metadata = { title: 'Sign up' };

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
