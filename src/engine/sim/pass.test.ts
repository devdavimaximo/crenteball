import { describe, expect, it } from 'vitest';

import type { Point } from '@/engine/domain/pitch';
import { createRng } from '@/engine/rng';

import { completionChance, resolvePass } from './pass';
import type { PassContext } from './pass';

const SEED = 20260721;

function context(overrides: Partial<PassContext> = {}): PassContext {
  return {
    from: { x: -10, y: 20 },
    to: { x: 6, y: 12 },
    defenders: [],
    passing: 55,
    composure: 50,
    pressure: 0,
    power: 0.5,
    isCross: false,
    ...overrides,
  };
}

function completionRate(overrides: Partial<PassContext> = {}, attempts = 4000): number {
  const rng = createRng(SEED);
  let complete = 0;
  for (let i = 0; i < attempts; i += 1) {
    if (resolvePass(context(overrides), rng).outcome === 'complete') complete += 1;
  }
  return complete / attempts;
}

describe('completionChance', () => {
  it('completes an easy pass most of the time', () => {
    expect(completionChance(context())).toBeGreaterThan(0.8);
  });

  it('rewards a better passer', () => {
    expect(completionChance(context({ passing: 85 }))).toBeGreaterThan(
      completionChance(context({ passing: 25 })),
    );
  });

  it('punishes a longer ball', () => {
    const short = completionChance(context({ to: { x: -8, y: 18 } }));
    const long = completionChance(context({ to: { x: 25, y: 2 } }));
    expect(long).toBeLessThan(short);
  });

  it('is harder for a cross than a ground pass', () => {
    expect(completionChance(context({ isCross: true }))).toBeLessThan(
      completionChance(context({ isCross: false })),
    );
  });

  it('stays a probability in every situation', () => {
    for (const passing of [1, 50, 99]) {
      for (const pressure of [0, 1]) {
        const chance = completionChance(context({ passing, pressure, composure: 0 }));
        expect(chance).toBeGreaterThan(0);
        expect(chance).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('interception', () => {
  const inLane: Point = { x: -2, y: 16 }; // between {-10,20} and {6,12}

  it('never intercepts with an open lane', () => {
    const rng = createRng(SEED);
    for (let i = 0; i < 500; i += 1) {
      expect(resolvePass(context({ defenders: [] }), rng).outcome).not.toBe('intercepted');
    }
  });

  it('sometimes intercepts with a defender in the lane', () => {
    const rng = createRng(SEED);
    let intercepted = 0;
    for (let i = 0; i < 2000; i += 1) {
      if (resolvePass(context({ defenders: [inLane] }), rng).outcome === 'intercepted') {
        intercepted += 1;
      }
    }
    expect(intercepted).toBeGreaterThan(100);
  });

  it('ignores a defender nowhere near the lane', () => {
    const rng = createRng(SEED);
    const farAway: Point = { x: 30, y: 40 };
    let intercepted = 0;
    for (let i = 0; i < 500; i += 1) {
      if (resolvePass(context({ defenders: [farAway] }), rng).outcome === 'intercepted') {
        intercepted += 1;
      }
    }
    expect(intercepted).toBe(0);
  });

  it('lowers completion when the lane is guarded', () => {
    expect(completionRate({ defenders: [inLane] })).toBeLessThan(completionRate({ defenders: [] }));
  });
});

describe('pressure, answered by composure', () => {
  it('a shaky player completes fewer under pressure', () => {
    const shaken = completionChance(context({ pressure: 1, composure: 10 }));
    const settled = completionChance(context({ pressure: 1, composure: 95 }));
    expect(settled).toBeGreaterThan(shaken);
  });

  it('composure is irrelevant with nothing at stake', () => {
    const calm = completionChance(context({ pressure: 0, composure: 10 }));
    const devout = completionChance(context({ pressure: 0, composure: 95 }));
    expect(devout).toBeCloseTo(calm, 6);
  });
});

describe('what a completed pass creates', () => {
  it('a ball into the box gives the receiver a chance', () => {
    const rng = createRng(SEED);
    const result = resolvePass(context({ to: { x: 2, y: 8 }, defenders: [] }), rng);
    if (result.outcome === 'complete') {
      expect(result.assistChance).toBeGreaterThan(0);
    }
  });

  it('a safe sideways pass creates nothing', () => {
    const rng = createRng(SEED);
    for (let i = 0; i < 200; i += 1) {
      const result = resolvePass(context({ to: { x: 20, y: 30 }, defenders: [] }), rng);
      if (result.outcome === 'complete') expect(result.assistChance).toBe(0);
    }
  });
});

describe('determinism', () => {
  it('replays the same pass identically', () => {
    const a = resolvePass(context({ defenders: [{ x: -2, y: 16 }] }), createRng(SEED));
    const b = resolvePass(context({ defenders: [{ x: -2, y: 16 }] }), createRng(SEED));
    expect(a).toEqual(b);
  });
});
