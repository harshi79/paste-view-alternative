import { useId } from 'react';

/**
 * VibeBin logo mark — a minimal "V" glyph on a rounded, dark tile.
 * Shared between the navbar, footer and favicon so the brand stays
 * consistent everywhere. No raster assets; one tiny SVG.
 */
export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="8"
        fill="#101016"
        stroke="#2b2b36"
        strokeWidth="3"
      />
      <path
        d="M19 18 32 46 45 18"
        stroke={`url(#${id})`}
        strokeWidth="9"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <defs>
        <linearGradient id={id} x1="20.5" y1="19.5" x2="43.5" y2="44.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark className={compact ? 'h-6 w-6' : 'h-8 w-8'} />
      <span
        className={`font-black uppercase tracking-tight text-white ${compact ? 'text-sm' : 'text-[17px] leading-none'}`}
      >
        Vibe<span className="text-brand-400">Bin</span>
      </span>
    </span>
  );
}
