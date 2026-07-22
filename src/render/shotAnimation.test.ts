import { describe, expect, it } from 'vitest';

import { GOAL_HALF_WIDTH } from '@/engine/balance/shot';
import type { ShotOutcome } from '@/engine/sim/shot';

import { ballWorldX } from './projection';
import { sampleShotAnimation, shotFlightMs } from './shotAnimation';
import type { ShotAnimationSpec } from './shotAnimation';

function spec(overrides: Partial<ShotAnimationSpec> = {}): ShotAnimationSpec {
  return {
    distance: 16,
    angle: 10,
    targetX: 2.8,
    targetY: 1.2,
    outcome: 'goal',
    power: 0.6,
    keeperX: 0.3,
    blockDepth: 6,
    ...overrides,
  };
}

const OUTCOMES: ShotOutcome[] = ['goal', 'saved', 'post', 'off-target', 'blocked'];

/** Sample a whole animation densely. */
function frames(s: ShotAnimationSpec, stepMs = 16) {
  const result = [];
  for (let t = 0; t <= 2600; t += stepMs) {
    const frame = sampleShotAnimation(s, t);
    result.push({ t, frame });
    if (frame.done) break;
  }
  return result;
}

describe('shotFlightMs', () => {
  it('makes harder shots arrive sooner', () => {
    expect(shotFlightMs(20, 1)).toBeLessThan(shotFlightMs(20, 0.1));
  });

  it('makes longer shots take longer', () => {
    expect(shotFlightMs(30, 0.5)).toBeGreaterThan(shotFlightMs(8, 0.5));
  });

  it('stays within readable bounds at the extremes', () => {
    expect(shotFlightMs(3, 1)).toBeGreaterThanOrEqual(260);
    expect(shotFlightMs(45, 0)).toBeLessThanOrEqual(900);
  });
});

describe('the flight', () => {
  it('starts at the shooter and travels towards the goal plane', () => {
    const s = spec();
    const first = sampleShotAnimation(s, 0);
    expect(first.ball.x).toBeCloseTo(ballWorldX(s.distance, s.angle), 5);
    expect(first.ball.metresFromGoal).toBeCloseTo(s.distance, 5);

    const later = sampleShotAnimation(s, shotFlightMs(s.distance, s.power) * 0.6);
    expect(later.ball.metresFromGoal).toBeLessThan(s.distance);
  });

  it('closes on the goal monotonically while in flight', () => {
    const s = spec();
    const flight = shotFlightMs(s.distance, s.power);
    let previous = Number.POSITIVE_INFINITY;
    for (let t = 0; t < flight; t += 16) {
      const m = sampleShotAnimation(s, t).ball.metresFromGoal;
      expect(m).toBeLessThanOrEqual(previous);
      previous = m;
    }
  });

  it('never dips the ball underground', () => {
    for (const outcome of OUTCOMES) {
      for (const { frame } of frames(spec({ outcome, targetY: 0.05 }))) {
        expect(frame.ball.y, outcome).toBeGreaterThanOrEqual(0.05);
      }
    }
  });

  it('keeps every coordinate finite for every outcome', () => {
    for (const outcome of OUTCOMES) {
      for (const { frame } of frames(spec({ outcome }))) {
        expect(Number.isFinite(frame.ball.x)).toBe(true);
        expect(Number.isFinite(frame.ball.y)).toBe(true);
        expect(Number.isFinite(frame.ball.metresFromGoal)).toBe(true);
      }
    }
  });

  it('always finishes', () => {
    for (const outcome of OUTCOMES) {
      const all = frames(spec({ outcome }));
      expect(all[all.length - 1]?.frame.done, outcome).toBe(true);
    }
  });
});

describe('each outcome reads differently', () => {
  it('a goal ends up behind the goal line', () => {
    const all = frames(spec({ outcome: 'goal' }));
    expect(all[all.length - 1]?.frame.ball.metresFromGoal).toBeLessThan(0);
  });

  it('a save bounces back into play', () => {
    const all = frames(spec({ outcome: 'saved' }));
    const last = all[all.length - 1]?.frame.ball;
    expect(last?.metresFromGoal).toBeGreaterThan(0);
    expect(last?.y).toBeLessThan(0.5);
  });

  it('a shot off the post rebounds out from the woodwork', () => {
    const s = spec({ outcome: 'post', targetX: GOAL_HALF_WIDTH + 0.1 });
    const all = frames(s);
    const last = all[all.length - 1]?.frame.ball;
    expect(last?.metresFromGoal).toBeGreaterThan(0);
    expect(Math.abs(last?.x ?? 99)).toBeLessThan(GOAL_HALF_WIDTH + 0.1);
  });

  it('a blocked shot never gets past the defender', () => {
    const s = spec({ outcome: 'blocked', blockDepth: 6 });
    for (const { frame } of frames(s)) {
      expect(frame.ball.metresFromGoal).toBeGreaterThanOrEqual(5.9);
    }
  });

  it('an off-target shot fades as it disappears', () => {
    const all = frames(spec({ outcome: 'off-target' }));
    const first = all[0]?.frame.ballAlpha ?? 0;
    const last = all[all.length - 1]?.frame.ballAlpha ?? 1;
    expect(first).toBe(1);
    expect(last).toBeLessThan(1);
  });
});

describe('the keeper', () => {
  it('waits before reacting', () => {
    const early = sampleShotAnimation(spec({ outcome: 'saved' }), 10);
    expect(Math.abs(early.keeper.dive)).toBeLessThan(0.05);
  });

  it('dives towards the ball, fully committed for a save', () => {
    const s = spec({ outcome: 'saved', targetX: 3, keeperX: 0 });
    const flight = shotFlightMs(s.distance, s.power);
    const late = sampleShotAnimation(s, flight + 100);
    expect(late.keeper.dive).toBeGreaterThan(0.6);
    expect(late.keeper.stretch).toBeGreaterThan(0.6);
  });

  it('dives the correct way', () => {
    const left = sampleShotAnimation(
      spec({ outcome: 'goal', targetX: -3, keeperX: 0 }),
      shotFlightMs(16, 0.6),
    );
    expect(left.keeper.dive).toBeLessThan(0);
  });

  it('barely moves for a shot flying wide', () => {
    const s = spec({ outcome: 'off-target' });
    const flight = shotFlightMs(s.distance, s.power);
    const late = sampleShotAnimation(s, flight + 100);
    expect(late.keeper.stretch).toBeLessThanOrEqual(0.3);
  });
});
