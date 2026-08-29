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
        x="1.5"
        y="1.5"
        width="61"
        height="61"
        rx="15"
        fill="#0c0c15"
        stroke="rgba(255,255,255,0.09)"
        strokeWidth="1.5"
      />
      <path
        d="M20.5 19.5 32 44.5 43.5 19.5"
        stroke={`url(#${id})`}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
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
        className={`font-bold tracking-tight text-white ${compact ? 'text-sm' : 'text-[17px] leading-none'}`}
      >
        Vibe<span className="text-brand-300">Bin</span>
      </span>
    </span>
  );
}
