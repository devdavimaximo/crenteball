import { describe, expect, it } from 'vitest';

import { KEY_MOMENT_TYPES } from '@/engine/balance/keyMoments';
import { HALF_WIDTH, PITCH_LENGTH } from '@/engine/domain/pitch';
import type { Position } from '@/engine/domain/state';
import { createRng } from '@/engine/rng';

import {
  generateMatchMoment,
  generateMatchMoments,
  matchMomentsRngFor,
} from './spatialMoment';
import type { MatchMoment } from './spatialMoment';
import type { MatchPlanContext } from './keyMoments';

const SEED = 20260721;

function context(overrides: Partial<MatchPlanContext> = {}): MatchPlanContext {
  return {
    position: 'FW',
    teamStrength: 55,
    opponentStrength: 55,
    isHome: true,
    energy: 100,
    ...overrides,
  };
}

function manyMatches(count: number, overrides: Partial<MatchPlanContext> = {}): MatchMoment[][] {
  const rng = createRng(SEED);
  return Array.from({ length: count }, () => generateMatchMoments(context(overrides), rng));
}

const everyone = (m: MatchMoment) => [m.ball, ...m.teammates.map((t) => t.point), ...m.defenders.map((d) => d.point), m.keeper];

describe('everyone stands on the pitch', () => {
  it('keeps every actor inside the field, every moment', () => {
    for (const moments of manyMatches(400)) {
      for (const moment of moments) {
        for (const p of everyone(moment)) {
          expect(Math.abs(p.x), moment.type).toBeLessThanOrEqual(HALF_WIDTH + 0.001);
          expect(p.y, moment.type).toBeGreaterThanOrEqual(-0.001);
          expect(p.y, moment.type).toBeLessThanOrEqual(PITCH_LENGTH + 0.001);
        }
      }
    }
  });

  it('puts the keeper on his line', () => {
    for (const moments of manyMatches(300)) {
      for (const moment of moments) {
        expect(moment.keeper.y).toBeLessThan(2);
        expect(Math.abs(moment.keeper.x)).toBeLessThanOrEqual(3.5);
      }
    }
  });

  it('shades the keeper towards the ball', () => {
    // Over many samples, a ball to the right pulls the keeper right of centre.
    const rng = createRng(SEED);
    const rightSided = Array.from({ length: 400 }, () =>
      generateMatchMoment('shot', 30, 0, rng),
    ).filter((m) => m.ball.x > 6);

    const meanKeeperX =
      rightSided.reduce((sum, m) => sum + m.keeper.x, 0) / Math.max(1, rightSided.length);
    expect(meanKeeperX).toBeGreaterThan(0);
  });
});

describe('the layout matches the moment', () => {
  it('puts a penalty on the spot with only the keeper', () => {
    const rng = createRng(SEED);
    for (let i = 0; i < 50; i += 1) {
      const penalty = generateMatchMoment('penalty', 70, i, rng);
      expect(penalty.ball).toEqual({ x: 0, y: 11 });
      expect(penalty.defenders).toHaveLength(0);
      expect(penalty.teammates).toHaveLength(0);
    }
  });

  it('gives a through-ball two teammates to find, further from goal', () => {
    const rng = createRng(SEED);
    const moments = Array.from({ length: 100 }, (_, i) =>
      generateMatchMoment('through-ball', 30, i, rng),
    );

    for (const m of moments) {
      expect(m.teammates.length).toBeGreaterThanOrEqual(1);
      // The ball starts deep; teammates are ahead of it, nearer goal.
      const meanMateY = m.teammates.reduce((s, t) => s + t.point.y, 0) / m.teammates.length;
      expect(meanMateY).toBeLessThan(m.ball.y);
    }
  });

  it('puts a cross out wide with bodies in the middle', () => {
    const rng = createRng(SEED);
    const crosses = Array.from({ length: 100 }, (_, i) => generateMatchMoment('cross', 30, i, rng));

    for (const m of crosses) {
      expect(Math.abs(m.ball.x)).toBeGreaterThan(15);
      // Teammates wait centrally in the box.
      for (const mate of m.teammates) {
        expect(Math.abs(mate.point.x)).toBeLessThan(Math.abs(m.ball.x));
      }
    }
  });

  it('places defenders between the ball and the goal', () => {
    const rng = createRng(SEED);
    const shots = Array.from({ length: 200 }, (_, i) => generateMatchMoment('shot', 30, i, rng));

    for (const m of shots) {
      for (const d of m.defenders) {
        // A defender helping his goal is nearer to it than the ball is.
        expect(d.point.y).toBeLessThanOrEqual(m.ball.y + 1);
      }
    }
  });

  it('gives more open situations fewer defenders than crowded ones', () => {
    const rng = createRng(SEED);
    const dribble = generateMatchMoment('dribble', 30, 0, rng);
    const cross = generateMatchMoment('cross', 30, 0, rng);
    expect(dribble.defenders.length).toBeLessThan(cross.defenders.length);
  });
});

describe('planning a match', () => {
  it('keeps the moment count and timing of the abstract generator', () => {
    for (const moments of manyMatches(300)) {
      expect(moments.length).toBeGreaterThanOrEqual(3);
      expect(moments.length).toBeLessThanOrEqual(6);
      const minutes = moments.map((m) => m.minute);
      expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
    }
  });

  it('guarantees the striker a shooting chance', () => {
    for (const moments of manyMatches(500, { position: 'FW' })) {
      expect(moments.some((m) => m.type === 'shot')).toBe(true);
    }
  });

  it('only produces types a position actually gets', () => {
    for (const position of ['GK', 'DF', 'MF', 'FW'] as Position[]) {
      for (const moments of manyMatches(100, { position })) {
        for (const moment of moments) {
          expect(KEY_MOMENT_TYPES).toContain(moment.type);
        }
      }
    }
  });

  it('is deterministic for a seed', () => {
    const a = generateMatchMoments(context(), matchMomentsRngFor(SEED, 1, 7, 'p1'));
    const b = generateMatchMoments(context(), matchMomentsRngFor(SEED, 1, 7, 'p1'));
    expect(a).toEqual(b);
  });

  it('varies between rounds', () => {
    const a = generateMatchMoments(context(), matchMomentsRngFor(SEED, 1, 7, 'p1'));
    const b = generateMatchMoments(context(), matchMomentsRngFor(SEED, 1, 8, 'p1'));
    expect(a).not.toEqual(b);
  });

  it('gives every actor a unique id within a moment', () => {
    for (const moments of manyMatches(100)) {
      for (const moment of moments) {
        const ids = [...moment.teammates, ...moment.defenders].map((a) => a.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });
});
