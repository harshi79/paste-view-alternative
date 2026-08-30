'use client';

/**
 * Global cursor particle trail — one fixed, transparent canvas layer mounted
 * once in the root layout. Purely a visual enhancement around the browser's
 * NATIVE cursor:
 *
 *   - No `cursor:` styles are ever set: the OS arrow, hand/pointer, I-beam,
 *     resize and contentEditable cursors all behave exactly as the browser
 *     provides them.
 *   - `pointer-events: none` + `aria-hidden` → the layer can never block
 *     clicks, text selection, dragging, inputs or focus; keyboard navigation
 *     is untouched.
 *   - Only `mouse` pointer events are tracked; touch/pen are ignored and the
 *     effect never starts on coarse-pointer (touch) devices.
 *   - `prefers-reduced-motion: reduce` disables the effect entirely.
 *
 * Performance: mouse positions are copied into plain variables per event and
 * consumed once per animation frame (no React state, no re-renders). The
 * particle pool is capped and expired particles are compacted in place. The
 * rAF loop parks itself whenever no particles are alive, so an idle mouse
 * costs zero frames per second.
 */

import { useEffect, useRef } from 'react';
import {
  MAX_PARTICLES,
  advanceParticles,
  pushCapped,
  spawnBurst,
  spawnTrailParticle,
  type TrailParticle,
} from '@/lib/cursorTrail';

/** Minimum pointer travel (px/frame) before another trail particle spawns. */
const TRAIL_SPACING = 7;

/** At most this many trail particles may spawn in a single frame. */
const MAX_SPAWNS_PER_FRAME = 3;

export default function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Touch devices and reduced-motion users never start the effect.
    const finePointer = window.matchMedia('(pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    let particles: TrailParticle[] = [];
    let pointerX = 0;
    let pointerY = 0;
    let lastX = 0;
    let lastY = 0;
    let hasPointer = false;
    let frameId = 0;
    let lastTime = 0;
    let running = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.round(window.innerHeight * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const stop = () => {
      running = false;
      if (frameId !== 0) cancelAnimationFrame(frameId);
      frameId = 0;
      particles = [];
      hasPointer = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    /** (Re)start the rAF loop — called from input events, never per move. */
    const wake = () => {
      if (!running || frameId !== 0) return;
      lastTime = performance.now();
      frameId = requestAnimationFrame(frame);
    };

    const frame = (now: number) => {
      const dt = Math.min(now - lastTime, 32); // clamp tab-switch jumps
      lastTime = now;

      if (hasPointer) {
        const dx = pointerX - lastX;
        const dy = pointerY - lastY;
        const dist = Math.hypot(dx, dy);
        const count = Math.min(Math.floor(dist / TRAIL_SPACING), MAX_SPAWNS_PER_FRAME);
        for (let i = 1; i <= count; i++) {
          const t = i / (count + 1); // space spawns along the travelled line
          particles = pushCapped(
            particles,
            [spawnTrailParticle(lastX + dx * t, lastY + dy * t)],
            MAX_PARTICLES,
          );
        }
        lastX = pointerX;
        lastY = pointerY;
      }

      particles = advanceParticles(particles, dt);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (particles.length > 0) {
        ctx.fillStyle = 'rgba(167, 139, 250, 1)'; // brand violet
        for (const p of particles) {
          ctx.globalAlpha = Math.min(p.life / p.maxLife, 0.85);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        frameId = requestAnimationFrame(frame);
      } else {
        // Nothing alive → park the loop until the next mouse event.
        frameId = 0;
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return; // ignore touch/pen
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!hasPointer) {
        lastX = pointerX;
        lastY = pointerY;
        hasPointer = true;
      }
      wake();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      particles = pushCapped(
        particles,
        spawnBurst(event.clientX, event.clientY),
        MAX_PARTICLES,
      );
      wake();
    };

    const start = () => {
      running = true;
      resize();
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerdown', onPointerDown, { passive: true });
      window.addEventListener('resize', resize);
    };

    const syncEnabled = () => {
      const enabled = finePointer.matches && !reducedMotion.matches;
      if (enabled && !running) start();
      else if (!enabled && running) stop();
    };

    finePointer.addEventListener('change', syncEnabled);
    reducedMotion.addEventListener('change', syncEnabled);
    syncEnabled();

    return () => {
      finePointer.removeEventListener('change', syncEnabled);
      reducedMotion.removeEventListener('change', syncEnabled);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', resize);
      if (frameId !== 0) cancelAnimationFrame(frameId);
      running = false;
      particles = [];
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[60]"
    />
  );
}
