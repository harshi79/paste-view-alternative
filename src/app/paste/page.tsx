import type { Metadata } from 'next';
import { getDb } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { purgeExpiredIfDue } from '@/lib/pastes';
import Editor from '@/components/Editor';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Create paste' };

export default async function PastePage() {
  const db = await getDb();
  const [session] = await Promise.all([getSessionUser(), purgeExpiredIfDue(db)]);

  return (
    <div className="animate-fade-up pb-6 pt-2 sm:pt-4">
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-5 px-0.5 sm:mb-6">
          <p className="eyebrow">New paste</p>
          <h1 className="mt-3 text-3xl font-black uppercase tracking-tight text-white sm:text-5xl">
            Create a paste
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-[15px]">
            Use the unified editor to publish plain text, code, or rich content without changing the
            existing creation flow.
          </p>
        </header>

        <Editor username={session?.user.username ?? null} />
      </div>
    </div>
  );
}
