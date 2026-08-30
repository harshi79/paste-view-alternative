/**
 * Cursor particle trail — pure simulation logic (no DOM access).
 *
 * Kept separate from the React component so the particle cap, lifetime
 * decay and pool cleanup rules can be unit-tested without a browser.
 * Everything here is intentionally tiny: a particle is a 7-field number
 * record, and all helpers run in O(n) over at most MAX_PARTICLES items.
 */

export interface TrailParticle {
  x: number;
  y: number;
  vx: number; // px per second
  vy: number; // px per second
  size: number; // radius, px
  life: number; // remaining lifetime, ms
  maxLife: number; // initial lifetime, used for the fade-out alpha
}

/** Hard cap on concurrently alive particles (trail + click burst). */
export const MAX_PARTICLES = 28;

/** Particles released by a single click — intentionally small. */
export const CLICK_BURST_COUNT = 6;

/** A faint dot left behind the cursor as it moves. */
export function spawnTrailParticle(x: number, y: number): TrailParticle {
  const life = 380 + Math.random() * 240;
  return {
    x,
    y,
    vx: (Math.random() - 0.5) * 16,
    vy: (Math.random() - 0.5) * 16,
    size: 1 + Math.random() * 1.4,
    life,
    maxLife: life,
  };
}

/** A small, short-lived radial puff on click. */
export function spawnBurst(x: number, y: number): TrailParticle[] {
  const burst: TrailParticle[] = [];
  for (let i = 0; i < CLICK_BURST_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 36 + Math.random() * 72;
    const life = 260 + Math.random() * 160;
    burst.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 1.4 + Math.random() * 1.3,
      life,
      maxLife: life,
    });
  }
  return burst;
}

/**
 * Advance the simulation by `dt` ms: move each particle along its velocity,
 * decay its lifetime and drop expired ones in place. No allocation and no
 * dead-particle buildup — the input array is compacted and returned.
 */
export function advanceParticles(
  particles: TrailParticle[],
  dt: number,
): TrailParticle[] {
  const seconds = dt / 1000;
  let write = 0;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const life = p.life - dt;
    if (life <= 0) continue; // expired → removed
    p.x += p.vx * seconds;
    p.y += p.vy * seconds;
    p.life = life;
    particles[write++] = p;
  }
  particles.length = write;
  return particles;
}

/**
 * Append new particles in place, keeping only the `cap` newest ones so the
 * pool can never grow past its limit (oldest are dropped first).
 */
export function pushCapped(
  particles: TrailParticle[],
  incoming: TrailParticle[],
  cap: number,
): TrailParticle[] {
  for (const p of incoming) particles.push(p);
  if (particles.length > cap) {
    particles.splice(0, particles.length - cap);
  }
  return particles;
}
