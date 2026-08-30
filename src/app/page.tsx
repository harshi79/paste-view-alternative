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
    <div className="animate-fade-up pb-6 pt-8 sm:pt-14 lg:pt-20">
      <section className="mx-auto flex max-w-4xl flex-col items-center text-center">
        <p className="eyebrow">Fast, private sharing</p>
        <div className="mt-6">
          <Logo />
        </div>

        <h1 className="mt-7 max-w-3xl text-balance text-3xl font-black tracking-tight text-white sm:text-5xl sm:leading-[1.05] lg:text-6xl">
          Share code and text with a link worth opening.
        </h1>

        <p className="mt-5 max-w-2xl text-balance text-sm leading-7 text-zinc-400 sm:text-lg sm:leading-8">
          VibeBin is a fast, private pastebin with syntax highlighting, expiring links, password
          protection, and rich-text formatting. No account required.
        </p>

        <div className="mt-8 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row sm:gap-4">
          <Link href="/paste" className="btn-primary w-full !px-6 !py-3 text-base sm:w-auto">
            Create paste
          </Link>
          <span className="text-sm text-zinc-500">Free · No account required</span>
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-5xl sm:mt-20">
        <div className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="card flex items-start gap-3.5 rounded-[24px] p-4 sm:p-5">
              <span className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-brand-300">
                {feature.icon}
              </span>
              <div>
                <h2 className="text-sm font-semibold text-white">{feature.title}</h2>
                <p className="mt-1.5 text-sm leading-6 text-zinc-400">{feature.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
