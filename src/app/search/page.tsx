import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Search' };

/**
 * Navigation destination only. Search is intentionally not implemented
 * in this job — there is no query parser, no search index, and no
 * search API.
 */
export default function SearchPage() {
  return (
    <div className="mx-auto max-w-2xl pt-6 sm:pt-10">
      <p className="eyebrow">Discover</p>
      <h1 className="mt-3 text-3xl font-black uppercase tracking-tight text-white sm:text-5xl">
        Search
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">
        Search is coming soon. Browse the newest public pastes while this page is being built.
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
