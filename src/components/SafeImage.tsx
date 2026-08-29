'use client';

import { useState } from 'react';

/**
 * Client-side <img> that hides itself if the source fails to load, so a
 * dead host never leaves a broken-image icon in the UI.
 */
export default function SafeImage({
  src,
  alt = '',
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (broken || !src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      decoding="async"
      loading="lazy"
      onError={() => setBroken(true)}
      className={className}
    />
  );
}
