import Link from 'next/link';
import Logo from '@/components/Logo';

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
    <div className="animate-fade-up pb-4 pt-10 sm:pt-16 lg:pt-24">
      {/* Hero */}
      <section className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <Logo />

        <h1 className="mt-8 text-balance text-4xl font-black tracking-tight text-white sm:text-6xl sm:leading-[1.05]">
          Share code and text with a link worth opening.
        </h1>

        <p className="mt-5 max-w-2xl text-balance text-base leading-8 text-zinc-400 sm:text-lg">
          VibeBin is a fast, private pastebin with syntax highlighting, expiring links, password
          protection, and rich-text formatting. No account required.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row sm:gap-4">
          <Link href="/paste" className="btn-primary !px-7 !py-3 text-base">
            Create Paste
          </Link>
          <span className="text-sm text-zinc-500">Free · No account required</span>
        </div>
      </section>

      {/* Feature strip */}
      <section className="mx-auto mt-16 max-w-4xl sm:mt-20">
        <div className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex items-start gap-3.5 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              <span className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-brand-300">
                {f.icon}
              </span>
              <div>
                <h2 className="text-sm font-semibold text-white">{f.title}</h2>
                <p className="mt-1.5 text-sm leading-6 text-zinc-400">{f.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
