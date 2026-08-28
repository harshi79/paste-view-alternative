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
  const vars = useMemo(
    () => ({ '--name-from': from, '--name-to': to }) as React.CSSProperties,
    [from, to],
  );

  if (effect === 'wave') {
    return <Wave text={text} vars={vars} intensity={intensity} className={className} />;
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
  const inlineColor = cls === '' ? { color: from } : undefined;

  // speed 0–100 maps to animation-duration scalar (lower speed = slower)
  const durationScale = useMemo(() => durationFor(speed), [speed]);
  const style2: React.CSSProperties = {
    ...vars,
    ...inlineColor,
    animationDuration:
      effect === 'none' || cls === 'effect-gradient-text' ? undefined : `${durationScale}s`,
    // intensity tweaks shadow strength for neon/fire/glitch
    filter:
      effect === 'neon' || effect === 'fire'
        ? `drop-shadow(0 0 ${Math.round(intensity / 8)}px ${from}88)`
        : undefined,
  };

  if (effect === 'typewriter') {
    return (
      <span className={className} style={vars}>
        <Typewriter
          text={text}
          baseColor={style === 'solid' ? from : undefined}
          from={from}
          to={to}
          speed={speed}
        />
      </span>
    );
  }

  return (
    <span className={`${cls} ${className}`} style={style2}>
      {text}
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
// ------------------------------------------------------------------
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
  return (
    <span
      className={`effect-wave ${className}`}
      style={{
        ...vars,
        // the .effect-wave animation is a single transform; we override
        // here to do letter-by-letter via inline style below.
        animation: 'none',
      }}
    >
      {Array.from(text).map((ch, i) => (
        <span
          key={i}
          className="inline-block"
          style={{
            color: vars['--name-from' as keyof React.CSSProperties] as string,
            animation: `wave-letter 1.2s ease-in-out ${(i * 80) % 1200}ms infinite`,
            // amplitude is approximated by tweaking translateY range below
            ['--amp' as string]: `${amplitude}px`,
          } as React.CSSProperties}
        >
          {ch === ' ' ? '\u00A0' : ch}
        </span>
      ))}
      <style jsx>{`
        @keyframes wave-letter {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(calc(var(--amp) * -1)); }
        }
      `}</style>
    </span>
  );
}
