import { describe, expect, it } from 'vitest';

import { GOAL_HALF_WIDTH, GOAL_HEIGHT } from '@/engine/balance/shot';
import { createRng } from '@/engine/rng';

import { aimingError, chanceQuality, resolveShot } from './shot';
import type { ShotContext, ShotInput, ShotOutcome } from './shot';

const SEED = 20260721;

function input(overrides: Partial<ShotInput> = {}): ShotInput {
  // Aimed just inside the right post, half height — a good finish.
  return { aimX: 0.75, aimY: 0.35, power: 0.6, curve: 0, ...overrides };
}

function context(overrides: Partial<ShotContext> = {}): ShotContext {
  return {
    distance: 11,
    angle: 0,
    defenders: 0,
    finishing: 50,
    dribbling: 50,
    composure: 50,
    pressure: 0,
    keeperRating: 50,
    ...overrides,
  };
}

/** Goal rate over many attempts — the only way to judge a stochastic model. */
function goalRate(
  shot: Partial<ShotInput> = {},
  situation: Partial<ShotContext> = {},
  attempts = 4000,
): number {
  const rng = createRng(SEED);
  let goals = 0;
  for (let i = 0; i < attempts; i += 1) {
    if (resolveShot(input(shot), context(situation), rng).outcome === 'goal') goals += 1;
  }
  return goals / attempts;
}

function outcomes(
  shot: Partial<ShotInput> = {},
  situation: Partial<ShotContext> = {},
  attempts = 4000,
): Record<ShotOutcome, number> {
  const rng = createRng(SEED);
  const tally: Record<ShotOutcome, number> = {
    goal: 0,
    saved: 0,
    post: 0,
    'off-target': 0,
    blocked: 0,
  };
  for (let i = 0; i < attempts; i += 1) {
    tally[resolveShot(input(shot), context(situation), rng).outcome] += 1;
  }
  return tally;
}

describe('determinism', () => {
  it('replays the same shot identically', () => {
    const a = resolveShot(input(), context(), createRng(SEED));
    const b = resolveShot(input(), context(), createRng(SEED));
    expect(a).toEqual(b);
  });

  it('produces every outcome eventually, and never anything else', () => {
    const tally = outcomes({}, { defenders: 2, distance: 20 }, 6000);
    for (const [outcome, count] of Object.entries(tally)) {
      expect(count, outcome).toBeGreaterThan(0);
    }
  });
});

describe('the shot feels fair', () => {
  it('rewards a well-placed shot from close range', () => {
    expect(goalRate({}, { distance: 8 })).toBeGreaterThan(0.35);
  });

  it('punishes range', () => {
    expect(goalRate({}, { distance: 30 })).toBeLessThan(goalRate({}, { distance: 8 }));
  });

  it('punishes a tight angle', () => {
    expect(goalRate({}, { angle: 40 })).toBeLessThan(goalRate({}, { angle: 0 }));
  });

  it('makes a better finisher score more, from the identical chance', () => {
    // The reason training an attribute is worth doing.
    expect(goalRate({}, { finishing: 85 })).toBeGreaterThan(goalRate({}, { finishing: 30 }));
  });

  it('rewards aiming for the corner over shooting down the middle', () => {
    const corner = goalRate({ aimX: 0.82, aimY: 0.25 });
    const middle = goalRate({ aimX: 0, aimY: 0.5 });
    expect(corner).toBeGreaterThan(middle);
  });

  it('makes a great keeper harder to beat', () => {
    expect(goalRate({}, { keeperRating: 85 })).toBeLessThan(goalRate({}, { keeperRating: 25 }));
  });

  it('never makes any chance a certainty', () => {
    expect(goalRate({}, { distance: 5, finishing: 99, keeperRating: 10 })).toBeLessThan(0.95);
  });

  it('never makes any chance hopeless', () => {
    expect(goalRate({}, { distance: 32, angle: 40, finishing: 20, defenders: 3 })).toBeGreaterThan(
      0,
    );
  });
});

describe('power is a trade-off, not a free win', () => {
  it('punishes a shot struck too softly for its range', () => {
    // Without this the power control is inert and minimum power is always
    // right. From distance the ball has to be hit.
    const soft = goalRate({ power: 0.1 }, { distance: 28 });
    const struck = goalRate({ power: 0.85 }, { distance: 28 });
    expect(struck).toBeGreaterThan(soft);
  });

  it('moves the best power up as the range grows', () => {
    // The property that makes power a decision rather than a slider to max:
    // close in you can place it, from distance you have to hit it. Asserted
    // as the shape of the curve rather than two arbitrary points, so a
    // rebalance does not invalidate the intent.
    const bestPowerAt = (distance: number): number => {
      const candidates = [0, 0.2, 0.4, 0.6, 0.8, 1];
      let best = 0;
      let bestRate = -1;
      for (const power of candidates) {
        const rate = goalRate({ power }, { distance }, 6000);
        if (rate > bestRate) {
          bestRate = rate;
          best = power;
        }
      }
      return best;
    };

    expect(bestPowerAt(5)).toBeLessThan(bestPowerAt(30));
  });

  it('beats the keeper more often', () => {
    const soft = outcomes({ power: 0.15 });
    const hard = outcomes({ power: 1 });
    // Of the shots that reached the goal, fewer of the hard ones were saved.
    const savedShare = (t: Record<ShotOutcome, number>) => t.saved / (t.saved + t.goal);
    expect(savedShare(hard)).toBeLessThan(savedShare(soft));
  });

  it('costs accuracy', () => {
    const soft = outcomes({ power: 0.15 });
    const hard = outcomes({ power: 1 });
    expect(hard['off-target']).toBeGreaterThan(soft['off-target']);
  });

  it('widens the aiming error', () => {
    expect(aimingError(input({ power: 1 }), context())).toBeGreaterThan(
      aimingError(input({ power: 0 }), context()),
    );
  });
});

describe('defenders and curve', () => {
  it('blocks shots when bodies are in the way', () => {
    expect(outcomes({}, { defenders: 0 }).blocked).toBe(0);
    expect(outcomes({}, { defenders: 3 }).blocked).toBeGreaterThan(0);
  });

  it('lets curve bend the ball around a wall', () => {
    const straight = outcomes({ curve: 0 }, { defenders: 3 });
    const curled = outcomes({ curve: 1 }, { defenders: 3 });
    expect(curled.blocked).toBeLessThan(straight.blocked);
  });

  it('charges accuracy for the curve', () => {
    expect(aimingError(input({ curve: 1 }), context())).toBeGreaterThan(
      aimingError(input({ curve: 0 }), context()),
    );
  });

  it('makes curve more controllable for a technical player', () => {
    const technical = aimingError(input({ curve: 1 }), context({ dribbling: 90 }));
    const clumsy = aimingError(input({ curve: 1 }), context({ dribbling: 20 }));
    expect(technical).toBeLessThan(clumsy);
  });
});

describe('pressure, and the faith that answers it', () => {
  it('makes a big moment harder', () => {
    expect(goalRate({}, { pressure: 1, composure: 0 })).toBeLessThan(
      goalRate({}, { pressure: 0, composure: 0 }),
    );
  });

  it('lets composure cancel the occasion — the faith pillar, in numbers', () => {
    const shaken = goalRate({}, { pressure: 1, composure: 10 });
    const settled = goalRate({}, { pressure: 1, composure: 95 });
    expect(settled).toBeGreaterThan(shaken);
  });

  it('gives composure no advantage when nothing is at stake', () => {
    // Devotion must not be a flat shooting bonus. It buys steadiness under
    // pressure and nothing else, or it stops being about the moment.
    const calm = aimingError(input(), context({ pressure: 0, composure: 10 }));
    const devout = aimingError(input(), context({ pressure: 0, composure: 95 }));
    expect(devout).toBeCloseTo(calm, 6);
  });

  it('does not make a devout player a better footballer', () => {
    // Same pressure, different finishing: technique still decides.
    const devoutButRaw = goalRate({}, { pressure: 1, composure: 100, finishing: 30 });
    const skilledButShaken = goalRate({}, { pressure: 1, composure: 20, finishing: 85 });
    expect(skilledButShaken).toBeGreaterThan(devoutButRaw);
  });
});

describe('where the ball ends up', () => {
  it('reports a landing point for every shot', () => {
    const rng = createRng(SEED);
    for (let i = 0; i < 500; i += 1) {
      const result = resolveShot(input(), context(), rng);
      expect(Number.isFinite(result.targetX)).toBe(true);
      expect(Number.isFinite(result.targetY)).toBe(true);
      expect(result.targetY).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps every goal inside the frame', () => {
    const rng = createRng(SEED);
    for (let i = 0; i < 2000; i += 1) {
      const result = resolveShot(input(), context(), rng);
      if (result.outcome !== 'goal') continue;
      expect(Math.abs(result.targetX)).toBeLessThanOrEqual(GOAL_HALF_WIDTH);
      expect(result.targetY).toBeLessThanOrEqual(GOAL_HEIGHT);
    }
  });

  it('sends a wild aim off target', () => {
    const tally = outcomes({ aimX: 1, aimY: 0.95, power: 1 }, { finishing: 25, distance: 28 });
    expect(tally['off-target']).toBeGreaterThan(tally.goal);
  });

  it('puts a shot off the post between a goal and a miss', () => {
    const tally = outcomes({ aimX: 0.98, aimY: 0.4 }, { distance: 16 }, 8000);
    expect(tally.post).toBeGreaterThan(0);
    expect(tally.post).toBeLessThan(tally.goal + tally['off-target']);
  });
});

describe('aimingError', () => {
  it('shrinks with skill, so the reticle rewards progress', () => {
    expect(aimingError(input(), context({ finishing: 90 }))).toBeLessThan(
      aimingError(input(), context({ finishing: 30 })),
    );
  });

  it('grows with distance, angle and defenders', () => {
    const easy = aimingError(input(), context());
    expect(aimingError(input(), context({ distance: 30 }))).toBeGreaterThan(easy);
    expect(aimingError(input(), context({ angle: 40 }))).toBeGreaterThan(easy);
    expect(aimingError(input(), context({ defenders: 3 }))).toBeGreaterThan(easy);
  });

  it('stays positive even for a hopeless player', () => {
    expect(aimingError(input({ power: 1, curve: 1 }), context({ finishing: 1, dribbling: 1 })))
      .toBeGreaterThan(0);
  });
});

describe('chanceQuality', () => {
  it('rates a tap-in above a long shot', () => {
    expect(chanceQuality(context({ distance: 4 }))).toBeGreaterThan(
      chanceQuality(context({ distance: 30 })),
    );
  });

  it('rates an open chance above a crowded one', () => {
    expect(chanceQuality(context({ defenders: 0 }))).toBeGreaterThan(
      chanceQuality(context({ defenders: 3 })),
    );
  });

  it('stays a probability', () => {
    for (const distance of [1, 5, 15, 30, 60]) {
      for (const defenders of [0, 1, 2, 3]) {
        const quality = chanceQuality(context({ distance, defenders }));
        expect(quality).toBeGreaterThan(0);
        expect(quality).toBeLessThanOrEqual(1);
      }
    }
  });
});
