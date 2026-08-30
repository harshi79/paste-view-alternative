'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getEffectDef, sanitizeNameEffect, type NameEffect, type NameStyle } from '@/lib/nameEffects';

export { NAME_EFFECTS, EFFECT_CATEGORIES } from '@/lib/nameEffects';
export type { NameEffect, NameStyle } from '@/lib/nameEffects';

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
  // Unknown / removed effect ids (e.g. the legacy "wave" value still stored
  // on older profiles) render as the neutral "none" effect.
  const safeEffect = sanitizeNameEffect(effect);

  const vars = useMemo(
    () => ({ '--name-from': safeFrom, '--name-to': safeTo }) as React.CSSProperties,
    [safeFrom, safeTo],
  );

  // speed 0–100 maps to animation-duration scalar (lower speed = slower).
  // Rules of Hooks: this useMemo (like every hook above) MUST run before the
  // typewriter early-return below. This component re-renders with a
  // different `effect` when the user changes the Effect select in the
  // profile customizer's live preview, so the number and order of hooks
  // called must be identical for every effect id — otherwise React throws
  // "Rendered more hooks than during the previous render" (or "fewer")
  // and the whole page crashes.
  const durationScale = useMemo(() => durationFor(safeSpeed), [safeSpeed]);

  // This early return is only legal AFTER all hook calls above.
  if (safeEffect === 'typewriter') {
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

  const def = getEffectDef(safeEffect);
  const cls =
    def && def.kind === 'css' && def.className
      ? def.className
      : style === 'gradient'
        ? 'effect-gradient-text'
        : '';
  const inlineColor = cls === '' ? { color: safeFrom } : undefined;

  const style2: React.CSSProperties = {
    ...vars,
    ...inlineColor,
    animationDuration: safeEffect !== 'none' ? `${durationScale}s` : undefined,
    // intensity tweaks shadow strength for neon/fire (unchanged behaviour).
    filter:
      safeEffect === 'neon' || safeEffect === 'fire'
        ? `drop-shadow(0 0 ${Math.round(safeIntensity / 8)}px ${safeFrom}88)`
        : undefined,
  };

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
