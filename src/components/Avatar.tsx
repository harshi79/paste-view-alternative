'use client';

import { useState } from 'react';

type Props = { value: string | null; label: string; className?: string };

/**
 * Avatar that falls back to an initial-on-gradient circle when empty or
 * when the URL can't be loaded (so a dead host never leaves a broken icon).
 */
export default function Avatar({ value, label, className = 'h-10 w-10' }: Props) {
  const [broken, setBroken] = useState(false);
  if (value && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={value}
        alt={label}
        onError={() => setBroken(true)}
        className={`${className} rounded-full object-cover`}
      />
    );
  }
  return (
    <span
      className={`${className} grid place-items-center rounded-full border-2 border-black/50 bg-brand-600 font-black text-white`}
    >
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}
