import type { Metadata } from 'next';
import ForgotPasswordForm from '@/components/ForgotPasswordForm';

export const metadata: Metadata = { title: 'Forgot password' };
export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
