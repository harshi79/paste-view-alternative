/**
 * Cursor particle trail — simulation rules + component contract.
 *
 * The physics module is pure (no DOM), so the pool cap, lifetime decay and
 * click-burst size can be verified directly. The component test pins the
 * layer's inert-ness contract: a single canvas, aria-hidden, pointer-events
 * none, and never any `cursor:` style that could replace the native cursor.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CLICK_BURST_COUNT,
  MAX_PARTICLES,
  advanceParticles,
  pushCapped,
  spawnBurst,
  spawnTrailParticle,
  type TrailParticle,
} from '@/lib/cursorTrail';

describe('cursorTrail — particle pool', () => {
  it('caps the pool at MAX_PARTICLES (no unbounded growth)', () => {
    let particles: TrailParticle[] = [];
    for (let i = 0; i < MAX_PARTICLES + 12; i++) {
      particles = pushCapped(particles, [spawnTrailParticle(i, i)], MAX_PARTICLES);
    }
    expect(particles.length).toBe(MAX_PARTICLES);
  });

  it('drops the oldest particles when the cap is exceeded', () => {
    const a = spawnTrailParticle(0, 0);
    const b = spawnTrailParticle(1, 1);
    const c = spawnTrailParticle(2, 2);
    const kept = pushCapped([a, b], [c], 2);
    expect(kept).toEqual([b, c]);
  });

  it('auto-removes particles once their lifetime expires', () => {
    const p = spawnTrailParticle(10, 20);
    const alive = advanceParticles([p], p.life - 1);
    expect(alive.length).toBe(1);
    expect(alive[0].life).toBeGreaterThan(0);
    const dead = advanceParticles(alive, 2);
    expect(dead.length).toBe(0);
  });

  it('moves particles along their velocity and decays their life', () => {
    const p: TrailParticle = {
      x: 0,
      y: 0,
      vx: 100,
      vy: 50,
      size: 2,
      life: 500,
      maxLife: 500,
    };
    const [moved] = advanceParticles([p], 200);
    expect(moved.x).toBeCloseTo(20);
    expect(moved.y).toBeCloseTo(10);
    expect(moved.life).toBeCloseTo(300);
  });

  it('advances an empty pool in place without allocating', () => {
    const empty: TrailParticle[] = [];
    expect(advanceParticles(empty, 16)).toBe(empty);
  });
});

describe('cursorTrail — click burst', () => {
  it('is small and short-lived', () => {
    const burst = spawnBurst(50, 60);
    expect(burst.length).toBe(CLICK_BURST_COUNT);
    expect(burst.length).toBeLessThanOrEqual(8);
    for (const p of burst) {
      expect(p.size).toBeGreaterThan(0);
      expect(p.size).toBeLessThan(3);
      expect(p.life).toBeGreaterThan(0);
      expect(p.life).toBeLessThanOrEqual(500);
    }
  });
});

describe('CursorTrail component', () => {
  it('renders a single inert, fixed canvas layer (native cursor untouched)', async () => {
    const { default: CursorTrail } = await import('@/components/CursorTrail');
    const html = renderToStaticMarkup(createElement(CursorTrail));
    expect((html.match(/<canvas/g) ?? []).length).toBe(1);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('pointer-events-none');
    expect(html).toContain('fixed');
    // The layer must never set any `cursor:` style that would replace the
    // browser's native arrow / hand / text cursors.
    expect(html).not.toContain('cursor:');
  });
});
