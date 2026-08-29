'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type NameStyle = 'solid' | 'gradient';
export type NameEffect =
  | 'none'
  | 'typewriter'
  | 'shimmer'
  | 'neon'
  | 'rainbow'
  | 'fire'
  | 'glitch'
  | 'wave'
  | 'aurora'
  | 'gold';

export const NAME_EFFECTS: { id: NameEffect; label: string; emoji: string }[] = [
  { id: 'none', label: 'None', emoji: '◻' },
  { id: 'typewriter', label: 'Typewriter', emoji: '⌨' },
  { id: 'shimmer', label: 'Shimmer', emoji: '✨' },
  { id: 'neon', label: 'Neon glow', emoji: '💡' },
  { id: 'rainbow', label: 'Rainbow', emoji: '🌈' },
  { id: 'fire', label: 'Fire', emoji: '🔥' },
  { id: 'glitch', label: 'Glitch', emoji: '📺' },
  { id: 'wave', label: 'Wave', emoji: '🌊' },
  { id: 'aurora', label: 'Aurora', emoji: '🌌' },
  { id: 'gold', label: 'Gold', emoji: '🥇' },
];

type Props = {
  text: string;
  from: string;
  to: string;
  style: NameStyle;
  effect: NameEffect;
  speed?: number; // 0-100
  intensity?: number; // 0-100
  className?: string;
};

const FALLBACK_FROM = '#a78bfa';
const FALLBACK_TO = '#22d3ee';

function clamp100(value: number | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export default function NameDisplay({
  text,
  from,
  to,
  style,
  effect,
  speed = 50,
  intensity = 60,
  className = '',
}: Props) {
  // Defensive: bad data (missing profile, NULL display_name, malformed
  // colors) must never crash the render tree.
  const safeText = typeof text === 'string' ? text : '';
  const safeFrom = typeof from === 'string' && from ? from : FALLBACK_FROM;
  const safeTo = typeof to === 'string' && to ? to : FALLBACK_TO;
  const safeSpeed = clamp100(speed, 50);
  const safeIntensity = clamp100(intensity, 60);

  const vars = useMemo(
    () => ({ '--name-from': safeFrom, '--name-to': safeTo }) as React.CSSProperties,
    [safeFrom, safeTo],
  );

  if (effect === 'wave') {
    return <Wave text={safeText} vars={vars} intensity={safeIntensity} className={className} />;
  }

  let cls = '';
  if (effect === 'shimmer') cls = 'effect-shimmer';
  else if (effect === 'neon') cls = 'effect-neon';
  else if (effect === 'rainbow') cls = 'effect-rainbow';
  else if (effect === 'fire') cls = 'effect-fire';
  else if (effect === 'glitch') cls = 'effect-glitch';
  else if (effect === 'aurora') cls = 'effect-aurora';
  else if (effect === 'gold') cls = 'effect-gold';
  else if (style === 'gradient') cls = 'effect-gradient-text';
  const inlineColor = cls === '' ? { color: safeFrom } : undefined;

  // speed 0–100 maps to animation-duration scalar (lower speed = slower)
  const durationScale = useMemo(() => durationFor(safeSpeed), [safeSpeed]);
  const style2: React.CSSProperties = {
    ...vars,
    ...inlineColor,
    animationDuration:
      effect === 'none' || cls === 'effect-gradient-text' ? undefined : `${durationScale}s`,
    // intensity tweaks shadow strength for neon/fire/glitch
    filter:
      effect === 'neon' || effect === 'fire'
        ? `drop-shadow(0 0 ${Math.round(safeIntensity / 8)}px ${safeFrom}88)`
        : undefined,
  };

  if (effect === 'typewriter') {
    return (
      <span className={className} style={vars}>
        <Typewriter
          text={safeText}
          baseColor={style === 'solid' ? safeFrom : undefined}
          from={safeFrom}
          to={safeTo}
          speed={safeSpeed}
        />
      </span>
    );
  }

  if (safeText === '') return null;

  return (
    <span className={`${cls} ${className}`} style={style2}>
      {safeText}
    </span>
  );
}

function durationFor(speed: number): number {
  // speed=0 → 8s, speed=50 → 4s, speed=100 → 1.4s
  const s = Math.max(0, Math.min(100, speed));
  const t = 1 - s / 100; // 0..1
  return Math.max(0.9, 1.4 + t * 6.6);
}

// ------------------------------------------------------------------
// Typewriter — types + deletes, speed adjusts tick rate.
// ------------------------------------------------------------------
function Typewriter({
  text,
  baseColor,
  from,
  to,
  speed,
}: {
  text: string;
  baseColor?: string;
  from: string;
  to: string;
  speed: number;
}) {
  const [len, setLen] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLen(0);
    setDeleting(false);
  }, [text]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const scale = 1 - Math.max(0, Math.min(100, speed)) / 100; // 0..1
    const step = 30 + scale * 80; // faster typing as speed grows
    let delay = deleting ? Math.round(step * 0.45) : step;
    if (!deleting && len === text.length) delay = 2200;
    if (deleting && len === 0) delay = 380;

    timer.current = setTimeout(() => {
      if (!deleting && len < text.length) setLen(len + 1);
      else if (!deleting && len === text.length) setDeleting(true);
      else if (deleting && len > 0) setLen(len - 1);
      else if (deleting && len === 0) setDeleting(false);
    }, delay);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [len, deleting, text, speed]);

  if (!text) return null;

  return (
    <>
      <span
        className={baseColor ? undefined : 'effect-gradient-text'}
        style={
          baseColor
            ? { color: baseColor }
            : ({ '--name-from': from, '--name-to': to } as React.CSSProperties)
        }
      >
        {text.slice(0, len)}
      </span>
      <span className="caret" style={{ height: '0.9em', verticalAlign: '-0.08em' }} />
    </>
  );
}

// ------------------------------------------------------------------
// Wave — each letter bobs on a phase offset.
// The @keyframes wave-letter lives in globals.css (styled-jsx is not
// SSR'd in the App Router, which previously left the animation broken
// and coupled it to an out-of-band runtime).
// ------------------------------------------------------------------
const WAVE_MAX_LETTERS = 80;

function Wave({
  text,
  vars,
  intensity,
  className,
}: {
  text: string;
  vars: React.CSSProperties;
  intensity: number;
  className: string;
}) {
  const amplitude = Math.max(1, Math.round(intensity / 10)); // 1..10 px

  // Memoize the letter spans: the component re-renders on parent state
  // changes (e.g. every keystroke in the settings preview) and rebuilding
  // a per-letter animated span every time is wasted work.
  const letters = useMemo(() => {
    const chars = Array.from(text.slice(0, WAVE_MAX_LETTERS));
    return chars.map((ch, i) => (
      <span
        key={`${i}-${ch === ' ' ? 'sp' : ch}`}
        className="inline-block"
        style={
          {
            color: 'var(--name-from)',
            animation: `wave-letter 1.2s ease-in-out ${(i * 80) % 1200}ms infinite`,
            '--amp': `${amplitude}px`,
          } as React.CSSProperties
        }
      >
        {ch === ' ' ? '\u00A0' : ch}
      </span>
    ));
  }, [text, amplitude]);

  if (letters.length === 0) return null;

  return (
    <span
      className={`effect-wave ${className}`}
      style={{ ...vars, animation: 'none' }}
      aria-label={text}
    >
      {letters}
    </span>
  );
}
