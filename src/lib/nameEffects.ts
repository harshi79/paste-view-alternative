/**
 * Single source of truth for profile name styling effects.
 *
 * Previously the effect id list was duplicated in three places
 * (NameDisplay.tsx, api/profile/route.ts, settings/page.tsx), which made
 * it easy for the renderer, the save-validator and the UI to drift apart.
 * Everything that needs the catalog now imports it from here.
 *
 * Each effect maps to a CSS class in src/app/globals.css (`.effect-*`),
 * except:
 *   - `none`     → no styling (nameStyle solid/gradient still applies)
 *   - `typewriter` → the JS typewriter renderer in NameDisplay.tsx
 *
 * The legacy `wave` effect was removed (it relied on a fragile per-letter
 * JS renderer + `calc(var(--amp))` inside @keyframes). `sanitizeNameEffect`
 * maps any unknown id — including saved `wave` values — safely back to
 * `none` so old profiles never break.
 */

export type NameStyle = 'solid' | 'gradient';

export const EFFECT_CATEGORIES = [
  'Basics',
  'Gradients',
  'Shimmer & sparkle',
  'Neon & glow',
  'Fire & ice',
  'Cyber & retro',
  'Wave & motion',
  'Shadow & outline',
  'Minimal & subtle',
] as const;

export type EffectCategory = (typeof EFFECT_CATEGORIES)[number];

export interface NameEffectDef {
  id: string;
  label: string;
  emoji: string;
  category: EffectCategory;
  /** 'none' | 'typewriter' | 'css' — css effects carry a className. */
  kind: 'none' | 'typewriter' | 'css';
  className?: string;
}

export const NAME_EFFECTS = [
  // ---------------------------------------------------------------- Basics
  { id: 'none', label: 'None', emoji: '◻️', category: 'Basics', kind: 'none' },
  { id: 'typewriter', label: 'Typewriter', emoji: '⌨️', category: 'Basics', kind: 'typewriter' },

  // -------------------------------------------------------------- Gradients
  { id: 'gradient-flow', label: 'Flow', emoji: '🎨', category: 'Gradients', kind: 'css', className: 'effect-gradient-flow' },
  { id: 'sunset', label: 'Sunset', emoji: '🌇', category: 'Gradients', kind: 'css', className: 'effect-sunset' },
  { id: 'ocean', label: 'Ocean', emoji: '🌊', category: 'Gradients', kind: 'css', className: 'effect-ocean' },
  { id: 'candy', label: 'Candy', emoji: '🍬', category: 'Gradients', kind: 'css', className: 'effect-candy' },
  { id: 'lava', label: 'Lava', emoji: '🌋', category: 'Gradients', kind: 'css', className: 'effect-lava' },
  { id: 'forest', label: 'Forest', emoji: '🌲', category: 'Gradients', kind: 'css', className: 'effect-forest' },
  { id: 'rainbow', label: 'Rainbow', emoji: '🌈', category: 'Gradients', kind: 'css', className: 'effect-rainbow' },
  { id: 'gold', label: 'Gold', emoji: '🥇', category: 'Gradients', kind: 'css', className: 'effect-gold' },

  // ------------------------------------------------------ Shimmer & sparkle
  { id: 'shimmer', label: 'Shimmer', emoji: '✨', category: 'Shimmer & sparkle', kind: 'css', className: 'effect-shimmer' },
  { id: 'crystal', label: 'Crystal', emoji: '💎', category: 'Shimmer & sparkle', kind: 'css', className: 'effect-crystal' },
  { id: 'glitter', label: 'Glitter', emoji: '🎊', category: 'Shimmer & sparkle', kind: 'css', className: 'effect-glitter' },
  { id: 'prism', label: 'Prism', emoji: '🔮', category: 'Shimmer & sparkle', kind: 'css', className: 'effect-prism' },

  // -------------------------------------------------------------- Neon & glow
  { id: 'neon', label: 'Neon glow', emoji: '💡', category: 'Neon & glow', kind: 'css', className: 'effect-neon' },
  { id: 'glow-soft', label: 'Soft glow', emoji: '🕯️', category: 'Neon & glow', kind: 'css', className: 'effect-glow-soft' },
  { id: 'glow-pulse', label: 'Breathing glow', emoji: '💓', category: 'Neon & glow', kind: 'css', className: 'effect-glow-pulse' },
  { id: 'neon-flicker', label: 'Flicker sign', emoji: '🚥', category: 'Neon & glow', kind: 'css', className: 'effect-neon-flicker' },
  { id: 'electric', label: 'Electric', emoji: '⚡', category: 'Neon & glow', kind: 'css', className: 'effect-electric' },
  { id: 'plasma', label: 'Plasma', emoji: '🟣', category: 'Neon & glow', kind: 'css', className: 'effect-plasma' },
  { id: 'laser', label: 'Laser', emoji: '🔦', category: 'Neon & glow', kind: 'css', className: 'effect-laser' },
  { id: 'aurora', label: 'Aurora', emoji: '🌌', category: 'Neon & glow', kind: 'css', className: 'effect-aurora' },

  // --------------------------------------------------------------- Fire & ice
  { id: 'fire', label: 'Fire', emoji: '🔥', category: 'Fire & ice', kind: 'css', className: 'effect-fire' },
  { id: 'ember', label: 'Ember', emoji: '🪵', category: 'Fire & ice', kind: 'css', className: 'effect-ember' },
  { id: 'inferno', label: 'Inferno', emoji: '☄️', category: 'Fire & ice', kind: 'css', className: 'effect-inferno' },
  { id: 'ice', label: 'Ice', emoji: '❄️', category: 'Fire & ice', kind: 'css', className: 'effect-ice' },
  { id: 'frost', label: 'Frost', emoji: '🧊', category: 'Fire & ice', kind: 'css', className: 'effect-frost' },
  { id: 'snow', label: 'Snowfall', emoji: '🌨️', category: 'Fire & ice', kind: 'css', className: 'effect-snow' },

  // ------------------------------------------------------------- Cyber & retro
  { id: 'cyber', label: 'Cyber', emoji: '🖥️', category: 'Cyber & retro', kind: 'css', className: 'effect-cyber' },
  { id: 'holographic', label: 'Holographic', emoji: '📀', category: 'Cyber & retro', kind: 'css', className: 'effect-holographic' },
  { id: 'matrix', label: 'Matrix', emoji: '🟢', category: 'Cyber & retro', kind: 'css', className: 'effect-matrix' },
  { id: 'glitch', label: 'Glitch', emoji: '📺', category: 'Cyber & retro', kind: 'css', className: 'effect-glitch' },
  { id: 'glitch-hard', label: 'Glitch hard', emoji: '🎞️', category: 'Cyber & retro', kind: 'css', className: 'effect-glitch-hard' },
  { id: 'glitch-rgb', label: 'RGB split', emoji: '🎛️', category: 'Cyber & retro', kind: 'css', className: 'effect-glitch-rgb' },
  { id: 'retro-80s', label: 'Retro 80s', emoji: '🕹️', category: 'Cyber & retro', kind: 'css', className: 'effect-retro-80s' },
  { id: 'vhs', label: 'VHS', emoji: '📼', category: 'Cyber & retro', kind: 'css', className: 'effect-vhs' },
  { id: 'pixel', label: 'Pixel', emoji: '👾', category: 'Cyber & retro', kind: 'css', className: 'effect-pixel' },
  { id: 'arcade', label: 'Arcade', emoji: '🎮', category: 'Cyber & retro', kind: 'css', className: 'effect-arcade' },

  // ------------------------------------------------------------- Wave & motion
  { id: 'float', label: 'Float', emoji: '🎈', category: 'Wave & motion', kind: 'css', className: 'effect-float' },
  { id: 'bounce', label: 'Bounce', emoji: '🏀', category: 'Wave & motion', kind: 'css', className: 'effect-bounce' },
  { id: 'ripple', label: 'Ripple', emoji: '🫧', category: 'Wave & motion', kind: 'css', className: 'effect-ripple' },
  { id: 'swing', label: 'Swing', emoji: '🎠', category: 'Wave & motion', kind: 'css', className: 'effect-swing' },
  { id: 'jello', label: 'Jello', emoji: '🍮', category: 'Wave & motion', kind: 'css', className: 'effect-jello' },
  { id: 'drift', label: 'Drift', emoji: '☁️', category: 'Wave & motion', kind: 'css', className: 'effect-drift' },
  { id: 'pulse', label: 'Pulse', emoji: '📶', category: 'Wave & motion', kind: 'css', className: 'effect-pulse' },

  // --------------------------------------------------------- Shadow & outline
  { id: 'outline', label: 'Outline', emoji: '✏️', category: 'Shadow & outline', kind: 'css', className: 'effect-outline' },
  { id: 'shadow-3d', label: '3D shadow', emoji: '🧱', category: 'Shadow & outline', kind: 'css', className: 'effect-shadow-3d' },
  { id: 'emboss', label: 'Emboss', emoji: '🪙', category: 'Shadow & outline', kind: 'css', className: 'effect-emboss' },
  { id: 'double-shadow', label: 'Double shadow', emoji: '🎭', category: 'Shadow & outline', kind: 'css', className: 'effect-double-shadow' },
  { id: 'long-shadow', label: 'Long shadow', emoji: '🌓', category: 'Shadow & outline', kind: 'css', className: 'effect-long-shadow' },
  { id: 'soft-shadow', label: 'Soft shadow', emoji: '💭', category: 'Shadow & outline', kind: 'css', className: 'effect-soft-shadow' },

  // ---------------------------------------------------------- Minimal & subtle
  { id: 'soft', label: 'Soft', emoji: '🌸', category: 'Minimal & subtle', kind: 'css', className: 'effect-soft' },
  { id: 'ghost', label: 'Ghost', emoji: '👻', category: 'Minimal & subtle', kind: 'css', className: 'effect-ghost' },
  { id: 'underline', label: 'Underline', emoji: '➖', category: 'Minimal & subtle', kind: 'css', className: 'effect-underline' },
  { id: 'highlight', label: 'Highlighter', emoji: '🖍️', category: 'Minimal & subtle', kind: 'css', className: 'effect-highlight' },
  { id: 'blink', label: 'Blink', emoji: '👁️', category: 'Minimal & subtle', kind: 'css', className: 'effect-blink' },
  { id: 'fade', label: 'Fade', emoji: '🌫️', category: 'Minimal & subtle', kind: 'css', className: 'effect-fade' },
] as const satisfies readonly NameEffectDef[];

export type NameEffect = (typeof NAME_EFFECTS)[number]['id'];

const EFFECT_DEFS: readonly NameEffectDef[] = NAME_EFFECTS;

const EFFECT_ID_SET: ReadonlySet<string> = new Set(EFFECT_DEFS.map((effect) => effect.id));

/** Look up a single effect definition by id. */
export function getEffectDef(id: string): NameEffectDef | undefined {
  return EFFECT_DEFS.find((effect) => effect.id === id);
}

/** True when `value` is one of the known effect ids. */
export function isNameEffect(value: unknown): value is NameEffect {
  return typeof value === 'string' && EFFECT_ID_SET.has(value);
}

/**
 * Coerce any stored value into a known effect id. Unknown ids — including
 * the removed legacy `wave` effect — fall back to `none` so that old saved
 * profiles render with the neutral style instead of breaking.
 */
export function sanitizeNameEffect(value: unknown): NameEffect {
  return isNameEffect(value) ? value : 'none';
}
