'use client';

type Props = { value: string | null; label: string; className?: string };

/** Avatar that falls back to an initial-on-gradient circle when empty. */
export default function Avatar({ value, label, className = 'h-10 w-10' }: Props) {
  if (value) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={value} alt={label} className={`${className} rounded-full object-cover`} />
    );
  }
  return (
    <span
      className={`${className} grid place-items-center rounded-full bg-gradient-to-br from-brand-500 to-cyan-400 font-bold text-night-950`}
    >
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}
