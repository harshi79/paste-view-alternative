'use client';

import { useEffect, useRef, useState } from 'react';

export type NameStyle = 'solid' | 'gradient';
export type NameEffect = 'none' | 'typewriter' | 'shimmer' | 'neon' | 'rainbow';

type Props = {
  text: string;
  from: string;
  to: string;
  style: NameStyle;
  effect: NameEffect;
  className?: string;
};

/**
 * Renders a username / display name with "premium" styling:
 * solid or gradient colors, plus typewriter / shimmer / neon / rainbow effects.
 */
export default function NameDisplay({ text, from, to, style, effect, className = '' }: Props) {
  const vars = { '--name-from': from, '--name-to': to } as React.CSSProperties;

  let cls = '';
  if (effect === 'shimmer') cls = 'effect-shimmer';
  else if (effect === 'neon') cls = 'effect-neon';
  else if (effect === 'rainbow') cls = 'effect-rainbow';
  else if (style === 'gradient') cls = 'effect-gradient-text';
  else cls = '';
  const inlineColor = cls === '' ? { color: from } : undefined;

  if (effect === 'typewriter') {
    return (
      <span className={className} style={vars}>
        <Typewriter text={text} baseColor={style === 'solid' ? from : undefined} from={from} to={to} />
      </span>
    );
  }

  return (
    <span className={`${cls} ${className}`} style={{ ...vars, ...inlineColor }}>
      {text}
    </span>
  );
}

function Typewriter({
  text,
  baseColor,
  from,
  to,
}: {
  text: string;
  baseColor?: string;
  from: string;
  to: string;
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

    let delay = deleting ? 34 : 74;
    if (!deleting && len === text.length) delay = 2600;
    if (deleting && len === 0) delay = 400;

    timer.current = setTimeout(() => {
      if (!deleting && len < text.length) setLen(len + 1);
      else if (!deleting && len === text.length) setDeleting(true);
      else if (deleting && len > 0) setLen(len - 1);
      else if (deleting && len === 0) setDeleting(false);
    }, delay);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [len, deleting, text]);

  return (
    <>
      <span
        className={
          baseColor
            ? undefined
            : 'effect-gradient-text'
        }
        style={baseColor ? { color: baseColor } : ({ '--name-from': from, '--name-to': to } as React.CSSProperties)}
      >
        {text.slice(0, len)}
      </span>
      <span className="caret" style={{ height: '0.9em', verticalAlign: '-0.08em' }} />
    </>
  );
}
