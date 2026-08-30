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
    <div className="animate-fade-up pb-4 pt-2 sm:pt-5">
      {/* Centred, focused workspace: the editor is the page. */}
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-4 px-0.5 sm:mb-5">
          <p className="eyebrow">New paste</p>
          <h1 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
            Create a paste
          </h1>
        </header>

        <Editor username={session?.user.username ?? null} />
      </div>
    </div>
  );
}
