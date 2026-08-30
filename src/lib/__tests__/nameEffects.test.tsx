import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import NameDisplay from '@/components/NameDisplay';
import {
  NAME_EFFECTS,
  EFFECT_CATEGORIES,
  getEffectDef,
  isNameEffect,
  sanitizeNameEffect,
  type NameEffect,
} from '@/lib/nameEffects';

describe('name effect registry', () => {
  it('offers at least 50 distinct styled effects (beyond "none")', () => {
    const styled = NAME_EFFECTS.filter((effect) => effect.id !== 'none');
    expect(styled.length).toBeGreaterThanOrEqual(50);
  });

  it('has unique, non-empty ids and labels', () => {
    const ids = NAME_EFFECTS.map((effect) => effect.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const effect of NAME_EFFECTS) {
      expect(effect.id.length).toBeGreaterThan(0);
      expect(effect.label.length).toBeGreaterThan(0);
    }
  });

  it('every effect belongs to a known category and css effects carry a class', () => {
    for (const effect of NAME_EFFECTS) {
      expect(EFFECT_CATEGORIES).toContain(effect.category);
      if (effect.kind === 'css') {
        expect(effect.className).toBeTruthy();
        expect(effect.className).toMatch(/^effect-/);
      }
    }
  });

  it('the legacy "wave" effect is gone and sanitizes to "none"', () => {
    expect(getEffectDef('wave')).toBeUndefined();
    expect(isNameEffect('wave')).toBe(false);
    expect(sanitizeNameEffect('wave')).toBe('none');
  });

  it('sanitizeNameEffect passes known ids through and rejects garbage', () => {
    expect(sanitizeNameEffect('cyber')).toBe('cyber');
    expect(sanitizeNameEffect('typewriter')).toBe('typewriter');
    expect(sanitizeNameEffect('')).toBe('none');
    expect(sanitizeNameEffect(null)).toBe('none');
    expect(sanitizeNameEffect(123)).toBe('none');
    expect(sanitizeNameEffect('not-a-real-effect')).toBe('none');
  });
});

describe('NameDisplay rendering', () => {
  it('renders the registered class for a new css effect', () => {
    const html = renderToStaticMarkup(
      createElement(NameDisplay, {
        text: 'VibeBin',
        from: '#a78bfa',
        to: '#22d3ee',
        style: 'gradient',
        effect: 'cyber',
      }),
    );
    expect(html).toContain('effect-cyber');
    expect(html).toContain('VibeBin');
  });

  it('renders every css effect with its registered class name', () => {
    for (const effect of NAME_EFFECTS) {
      if (effect.kind !== 'css') continue;
      const html = renderToStaticMarkup(
        createElement(NameDisplay, {
          text: 'Name',
          from: '#a78bfa',
          to: '#22d3ee',
          style: 'solid',
          effect: effect.id,
        }),
      );
      expect(html).toContain(effect.className);
    }
  });

  it('renders legacy "wave" as the neutral gradient fallback (never a broken wave)', () => {
    const html = renderToStaticMarkup(
      createElement(NameDisplay, {
        text: 'Name',
        from: '#a78bfa',
        to: '#22d3ee',
        style: 'gradient',
        effect: 'wave' as unknown as NameEffect,
      }),
    );
    expect(html).not.toContain('effect-wave');
    expect(html).toContain('effect-gradient-text');
  });

  it('keeps existing effects working (shimmer, neon, gold, typewriter)', () => {
    const shimmer = renderToStaticMarkup(
      createElement(NameDisplay, {
        text: 'Name',
        from: '#a78bfa',
        to: '#22d3ee',
        style: 'solid',
        effect: 'shimmer',
      }),
    );
    expect(shimmer).toContain('effect-shimmer');

    const neon = renderToStaticMarkup(
      createElement(NameDisplay, {
        text: 'Name',
        from: '#a78bfa',
        to: '#22d3ee',
        style: 'solid',
        effect: 'neon',
      }),
    );
    expect(neon).toContain('effect-neon');

    const gold = renderToStaticMarkup(
      createElement(NameDisplay, {
        text: 'Name',
        from: '#a78bfa',
        to: '#22d3ee',
        style: 'solid',
        effect: 'gold',
      }),
    );
    expect(gold).toContain('effect-gold');

    const typewriter = renderToStaticMarkup(
      createElement(NameDisplay, {
        text: 'Name',
        from: '#a78bfa',
        to: '#22d3ee',
        style: 'solid',
        effect: 'typewriter',
      }),
    );
    expect(typewriter).toContain('caret');
  });
});
