import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Trending' };

/**
 * Navigation destination only. Trending ranking is intentionally not
 * implemented in this job — there is no score, no popularity sort, and
 * no trending API.
 */
export default function TrendingPage() {
  return (
    <div className="mx-auto max-w-2xl pt-6 sm:pt-10">
      <p className="eyebrow">Discover</p>
      <h1 className="mt-3 text-3xl font-black uppercase tracking-tight text-white sm:text-5xl">
        Trending
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">
        Trending is coming soon. In the meantime, browse posts in chronological order on Latest.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/latest" className="btn-primary">
          View latest
        </Link>
        <Link href="/" className="btn-ghost">
          Home
        </Link>
      </div>
    </div>
  );
}
