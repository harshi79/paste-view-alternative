import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth';
import { listLatestPastes } from '@/lib/feed';
import LatestFeed from '@/components/LatestFeed';

export const metadata: Metadata = { title: 'Latest' };
export const dynamic = 'force-dynamic';

export default async function LatestPage() {
  const session = await getSessionUser();
  const initial = await listLatestPastes({ viewerId: session?.user.id ?? null });

  return (
    <div className="mx-auto max-w-3xl pt-2 sm:pt-4">
      <header className="mb-5 min-w-0">
        <p className="eyebrow">Discovery</p>
        <h1 className="mt-3 break-words text-3xl font-black uppercase tracking-tight text-white sm:text-5xl">
          Latest
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">
          Newest public pastes first. No popularity ranking — just chronological discovery.
        </p>
      </header>
      <LatestFeed initial={initial} guest={!session} />
    </div>
  );
}
