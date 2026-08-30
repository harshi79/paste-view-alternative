import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import NameDisplay from '@/components/NameDisplay';
import { NAME_EFFECTS } from '@/lib/nameEffects';

// Regression test for the Rules-of-Hooks crash in NameDisplay.
//
// NameDisplay re-renders with a different `effect` prop whenever the user
// changes the Effect select in the profile customizer's live preview (or a
// saved profile loads over a previously rendered one). The typewriter
// branch used to return early BETWEEN the component's two useMemo calls,
// so React threw "Rendered more hooks than during the previous render" /
// "Rendered fewer hooks than expected" and crashed the whole page.
//
// This repo's vitest setup runs in a plain node environment (no jsdom, no
// testing-library), so instead of an interactive re-render we call the
// component function directly with stubbed hooks and assert that the
// hook-call sequence is identical for every effect id — exactly the
// invariant the Rules of Hooks require across renders. JSX compiles to the
// automatic runtime ('react/jsx-runtime', unmocked), so element creation
// still works while the hook exports are recorded.
//
// ('react' is mocked in this file only; the SSR tests in
// nameEffects.test.tsx use the real react-dom/server and are unaffected.)

const hookLog = vi.hoisted(() => [] as string[]);

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useMemo: (fn: () => unknown) => {
      hookLog.push('useMemo');
      return fn();
    },
    useState: (initial: unknown) => {
      hookLog.push('useState');
      return [initial, () => {}] as const;
    },
    useRef: (initial: unknown) => {
      hookLog.push('useRef');
      return { current: initial };
    },
    useEffect: () => {
      hookLog.push('useEffect');
    },
  };
});

type Props = ComponentProps<typeof NameDisplay>;

const baseProps: Props = {
  text: 'VibeBin',
  from: '#a78bfa',
  to: '#22d3ee',
  style: 'solid',
  effect: 'none',
  speed: 40,
  intensity: 70,
  className: 'x',
};

/** Directly invoke NameDisplay with the stub dispatcher, capturing hooks. */
function hookSequenceFor(overrides: Partial<Props>): string[] {
  hookLog.length = 0;
  NameDisplay({ ...baseProps, ...overrides });
  return [...hookLog];
}

describe('NameDisplay Rules-of-Hooks stability', () => {
  it('calls the same hooks in the same order for every registered effect', () => {
    const baseline = hookSequenceFor({ effect: 'none' });
    expect(baseline.length).toBeGreaterThan(0);
    for (const effect of NAME_EFFECTS) {
      expect(hookSequenceFor({ effect: effect.id }), `effect=${effect.id}`).toEqual(baseline);
    }
  });

  it('keeps the hook order stable for legacy/garbage ids (e.g. saved "wave")', () => {
    const baseline = hookSequenceFor({ effect: 'none' });
    for (const bad of ['wave', 'not-an-effect', '']) {
      expect(hookSequenceFor({ effect: bad as Props['effect'] }), `effect=${bad}`).toEqual(
        baseline,
      );
    }
  });

  it('hook order does not depend on other prop values', () => {
    const baseline = hookSequenceFor({ effect: 'typewriter' });
    expect(
      hookSequenceFor({
        effect: 'typewriter',
        text: '',
        style: 'gradient',
        speed: 0,
        intensity: 100,
      }),
    ).toEqual(baseline);
  });
});
