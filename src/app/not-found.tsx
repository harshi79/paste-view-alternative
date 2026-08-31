import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center pt-10 text-center">
      <div className="animate-pop">
        <p className="text-7xl font-black">
          <span className="effect-gradient-text" style={{ '--name-from': '#a78bfa', '--name-to': '#22d3ee' } as React.CSSProperties}>
            404
          </span>
        </p>
        <h1 className="mt-3 text-xl font-black uppercase tracking-tight text-white">Page not found</h1>
        <p className="mt-2 text-zinc-400">
          The page you&apos;re looking for doesn&apos;t exist or the paste was removed.
        </p>
        <Link href="/paste" className="btn-primary mt-6 inline-block px-6 py-2.5 text-sm uppercase tracking-wide">
          Create a paste
        </Link>
      </div>
    </div>
  );
}
