import type { CSSProperties } from 'react';

const KNOWN_EFFECTS = new Set(['shimmer', 'neon', 'rainbow', 'fire', 'gold']);

type Props = {
  label: string;
  color: string;
  effect?: string | null;
  /** 'sm' sits inline next to the profile name; 'md' is the default chip size. */
  size?: 'sm' | 'md';
  /** When provided, renders a small × remove button (admin UIs only). */
  onRemove?: () => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Renders an admin-awarded user tag (e.g. "Founder") as a premium chip:
 * a 1px colored ring around a dark glass body, with optional animated
 * effects (gold, rainbow, fire, neon, shimmer). Shared by the profile
 * page and every admin surface so tags always look identical.
 */
export default function TagBadge({
  label,
  color,
  effect = '',
  size = 'md',
  onRemove,
  disabled,
  className = '',
}: Props) {
  const fx = effect && KNOWN_EFFECTS.has(effect) ? effect : '';
  return (
    <span
      className={`tagchip${fx ? ` tagchip--${fx}` : ''}${size === 'sm' ? ' tagchip--sm' : ''} ${className}`}
      style={{ '--tag-color': color } as CSSProperties}
      title={label}
    >
      <span className="tagchip-body">
        <span className="tagchip-label">{label}</span>
        {onRemove && (
          <button
            type="button"
            aria-label={`Remove ${label} tag`}
            title={`Remove ${label}`}
            disabled={disabled}
            onClick={onRemove}
            className="-mr-1 grid h-3.5 w-3.5 flex-none place-items-center rounded-full text-[10px] leading-none text-zinc-400 transition hover:bg-white/15 hover:text-white disabled:opacity-40"
          >
            ×
          </button>
        )}
      </span>
    </span>
  );
}
