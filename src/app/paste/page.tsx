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
    <div className="animate-fade-up pb-2 pt-3 sm:pt-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow">New paste</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
            Create a paste
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-[15px]">
            A focused workspace — title, language, visibility, expiration, password, and rich
            formatting all in one canvas.
          </p>
        </div>
      </header>

      <Editor username={session?.user.username ?? null} />
    </div>
  );
}
