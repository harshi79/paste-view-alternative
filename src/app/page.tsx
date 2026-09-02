import Link from 'next/link';

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
    title: 'Syntax highlighting',
    text: '60+ languages, raw view, and one-click download.',
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <rect x="3.5" y="8.5" width="13" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6.5 8.5V6a3.5 3.5 0 0 1 7 0v2.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    title: 'Private by default',
    text: 'Passwords, expiring links, and unlisted sharing.',
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <path d="M4 6.5h9M13 6.5h.4M4 10h4.5M11 10h5M4 13.5h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: 'Rich text',
    text: 'Fonts, colors, stickers, and GIFs in one editor.',
  },
];

export default function HomePage() {
  return (
    <div className="animate-fade-up relative pb-6 pt-6 sm:pt-10 lg:pt-14">
      {/* Decorative watermark — pure CSS, aria-hidden, no content meaning. */}
      <p
        aria-hidden
        className="pointer-events-none absolute -top-2 right-0 hidden select-none font-black uppercase leading-none tracking-tighter text-transparent lg:block"
        style={{ WebkitTextStroke: '2px rgba(255,255,255,0.05)', fontSize: 'clamp(6rem,14vw,11rem)' }}
      >
        VibeBin
      </p>

      <section className="relative mx-auto flex max-w-4xl flex-col items-start text-left">
        <p className="eyebrow">Fast, private sharing</p>

        <h1 className="mt-7 max-w-3xl text-balance text-4xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-6xl sm:leading-[0.95] lg:text-7xl">
          Share code and text with a{' '}
          <span
            className="text-transparent"
            style={{ WebkitTextStroke: '2px var(--vb-accent-2)' }}
          >
            link
          </span>{' '}
          worth opening.
        </h1>

        <p className="mt-6 max-w-2xl text-pretty text-sm leading-7 text-zinc-400 sm:text-lg sm:leading-8">
          VibeBin is a fast, private pastebin with syntax highlighting, expiring links, password
          protection, and rich-text formatting. No account required.
        </p>

        <div className="mt-9 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
          <Link href="/paste" className="btn-primary w-full !px-7 !py-3.5 text-base uppercase tracking-wide sm:w-auto">
            Create paste
          </Link>
          <Link href="/latest" className="btn-ghost w-full !px-7 !py-3.5 text-base sm:w-auto">
            Browse latest
          </Link>
        </div>
        <p className="mt-4 font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">
          Free · No account required
        </p>
      </section>

      <section className="mx-auto mt-16 max-w-6xl sm:mt-24">
        <div className="grid gap-5 sm:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className="card group flex flex-col gap-4 p-5 transition-transform duration-150 hover:-translate-x-0.5 hover:-translate-y-0.5 sm:p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="grid h-10 w-10 flex-none place-items-center rounded-md border-2 border-[color:var(--vb-line)] bg-[color:var(--vb-panel-2)] text-brand-300 shadow-[2px_2px_0_0_var(--vb-ink)]">
                  {feature.icon}
                </span>
                <span className="font-mono text-xs font-bold text-zinc-600">
                  0{i + 1}
                </span>
              </div>
              <div>
                <h2 className="text-base font-black uppercase tracking-tight text-white">
                  {feature.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{feature.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
