import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isAdmin, getAdminPassword } from '@/lib/auth';
import AdminLoginForm from '@/components/AdminLoginForm';

export const metadata: Metadata = { title: 'Admin sign in' };
export const dynamic = 'force-dynamic';

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect('/admin');
  return (
    <div className="grid min-h-[60vh] place-items-center pt-10">
      <div className="w-full max-w-md">
        <div className="animate-fade-up rounded-3xl border border-white/10 bg-night-800/60 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 text-xl shadow-lg shadow-rose-500/30">
              🛡
            </div>
            <h1 className="text-2xl font-extrabold text-white">Admin sign-in</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Enter the admin password to access the control panel.
            </p>
            {!getAdminPassword() && (
              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                ADMIN_PASSWORD is not set on the server. Add it in Vercel → Environment Variables.
              </p>
            )}
          </div>
          <AdminLoginForm />
        </div>
      </div>
    </div>
  );
}
