import { describe, expect, it } from 'vitest';

import {
  KEY_MOMENT_TYPES,
  MAX_MOMENTS,
  MIN_MINUTES_BETWEEN_MOMENTS,
  MIN_MOMENTS,
  MOMENT_GEOMETRY,
} from '@/engine/balance/keyMoments';
import { POSITIONS } from '@/engine/domain/state';
import type { Position } from '@/engine/domain/state';
import { createRng } from '@/engine/rng';

import { generateKeyMoments, keyMomentsRngFor, momentCountFor } from './keyMoments';
import type { KeyMoment, MatchPlanContext } from './keyMoments';

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

/** Many matches, for anything about distribution rather than one result. */
function manyMatches(count: number, overrides: Partial<MatchPlanContext> = {}): KeyMoment[][] {
  const rng = createRng(SEED);
  return Array.from({ length: count }, () => generateKeyMoments(context(overrides), rng));
}

describe('how many moments a match gives', () => {
  it('stays within the designed range, always', () => {
    for (const moments of manyMatches(2000)) {
      expect(moments.length).toBeGreaterThanOrEqual(MIN_MOMENTS);
      expect(moments.length).toBeLessThanOrEqual(MAX_MOMENTS);
    }
  });

  it('averages around four for an evenly matched game', () => {
    const counts = manyMatches(2000).map((moments) => moments.length);
    const average = counts.reduce((sum, n) => sum + n, 0) / counts.length;
    expect(average).toBeGreaterThan(3.7);
    expect(average).toBeLessThan(5);
  });

  it('gives a dominant side more to do', () => {
    const strong = manyMatches(1000, { teamStrength: 75, opponentStrength: 40 });
    const weak = manyMatches(1000, { teamStrength: 40, opponentStrength: 75 });

    const mean = (matches: KeyMoment[][]) =>
      matches.reduce((sum, m) => sum + m.length, 0) / matches.length;

    expect(mean(strong)).toBeGreaterThan(mean(weak));
  });

  it('punishes exhaustion', () => {
    const fresh = manyMatches(1000, { energy: 100 });
    const spent = manyMatches(1000, { energy: 20 });

    const mean = (matches: KeyMoment[][]) =>
      matches.reduce((sum, m) => sum + m.length, 0) / matches.length;

    expect(mean(spent)).toBeLessThan(mean(fresh));
  });

  it('rounds stochastically, so a fractional expectation is not silently lost', () => {
    // An expected 4.3 must sometimes give five. Rounding down would shave a
    // moment off every match for the weaker side.
    const rng = createRng(SEED);
    const counts = new Set(
      Array.from({ length: 400 }, () =>
        momentCountFor(context({ teamStrength: 60, opponentStrength: 52 }), rng),
      ),
    );
    expect(counts.size).toBeGreaterThan(1);
  });
});

describe('when moments happen', () => {
  it('keeps every moment inside the ninety minutes', () => {
    for (const moments of manyMatches(500)) {
      for (const moment of moments) {
        expect(moment.minute).toBeGreaterThanOrEqual(1);
        expect(moment.minute).toBeLessThanOrEqual(90);
      }
    }
  });

  it('lists them in chronological order', () => {
    for (const moments of manyMatches(500)) {
      const minutes = moments.map((m) => m.minute);
      expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
    }
  });

  it('never bunches two decisive moments into the same passage of play', () => {
    for (const moments of manyMatches(1000)) {
      for (let i = 1; i < moments.length; i += 1) {
        const gap = (moments[i]?.minute ?? 0) - (moments[i - 1]?.minute ?? 0);
        expect(gap, moments.map((m) => m.minute).join(',')).toBeGreaterThanOrEqual(
          MIN_MINUTES_BETWEEN_MOMENTS / 2,
        );
      }
    }
  });

  it('spreads them across the whole match, not just one half', () => {
    const minutes = manyMatches(500).flat().map((m) => m.minute);
    const firstHalf = minutes.filter((m) => m <= 45).length;
    const secondHalf = minutes.filter((m) => m > 45).length;

    const share = firstHalf / (firstHalf + secondHalf);
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.6);
    expect(secondHalf).toBeGreaterThan(0);
  });

  it('gives every moment a unique id', () => {
    for (const moments of manyMatches(200)) {
      expect(new Set(moments.map((m) => m.id)).size).toBe(moments.length);
    }
  });
});

describe('what kind of moment each position gets', () => {
  const typeCounts = (position: Position) => {
    const counts = Object.fromEntries(KEY_MOMENT_TYPES.map((t) => [t, 0])) as Record<
      (typeof KEY_MOMENT_TYPES)[number],
      number
    >;

    for (const moments of manyMatches(1500, { position })) {
      for (const moment of moments) counts[moment.type] += 1;
    }
    return counts;
  };

  it('sends strikers to shoot more than to tackle', () => {
    const counts = typeCounts('FW');
    expect(counts.shot).toBeGreaterThan(counts.tackle);
    expect(counts.shot).toBeGreaterThan(counts['through-ball']);
  });

  it('sends defenders to tackle more than to shoot', () => {
    const counts = typeCounts('DF');
    expect(counts.tackle).toBeGreaterThan(counts.shot);
    expect(counts.header).toBeGreaterThan(counts.shot);
  });

  it('makes midfielders creators first', () => {
    const counts = typeCounts('MF');
    expect(counts['through-ball']).toBeGreaterThan(counts.shot);
    expect(counts['through-ball']).toBeGreaterThan(counts.tackle);
  });

  it('gives keepers saves and nothing they have no business doing', () => {
    const counts = typeCounts('GK');
    expect(counts.save).toBeGreaterThan(0);
    expect(counts.shot).toBe(0);
    expect(counts.header).toBe(0);
    expect(counts.dribble).toBe(0);
    expect(counts.penalty).toBe(0);
  });

  it('keeps penalties rare enough to feel like an event', () => {
    const counts = typeCounts('FW');
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    const penaltyShare = counts.penalty / total;
    expect(penaltyShare).toBeLessThan(0.06);
    expect(counts.penalty).toBeGreaterThan(0);
  });

  it('only produces types the position actually has weight for', () => {
    for (const position of POSITIONS) {
      const counts = typeCounts(position);
      for (const [type, count] of Object.entries(counts)) {
        if (count > 0) {
          expect(
            MOMENT_GEOMETRY[type as keyof typeof MOMENT_GEOMETRY],
            `${position} produziu ${type}`,
          ).toBeDefined();
        }
      }
    }
  });
});

describe('the signature moment is guaranteed', () => {
  it('always gives a striker at least one shot', () => {
    for (const moments of manyMatches(2000, { position: 'FW' })) {
      expect(
        moments.some((m) => m.type === 'shot'),
        moments.map((m) => m.type).join(','),
      ).toBe(true);
    }
  });

  it('always gives a midfielder at least one through ball', () => {
    for (const moments of manyMatches(1000, { position: 'MF' })) {
      expect(moments.some((m) => m.type === 'through-ball')).toBe(true);
    }
  });

  it('always gives a defender at least one tackle', () => {
    for (const moments of manyMatches(1000, { position: 'DF' })) {
      expect(moments.some((m) => m.type === 'tackle')).toBe(true);
    }
  });

  it('always gives a keeper at least one save', () => {
    for (const moments of manyMatches(1000, { position: 'GK' })) {
      expect(moments.some((m) => m.type === 'save')).toBe(true);
    }
  });

  it('does not always place it at the same point in the match', () => {
    // A guaranteed moment that is always the first one would be a tell.
    const positions = new Set(
      manyMatches(500, { position: 'FW' }).map((moments) =>
        moments.findIndex((m) => m.type === 'shot'),
      ),
    );
    expect(positions.size).toBeGreaterThan(1);
  });

  it('still lets a striker have more than one shot', () => {
    const multiple = manyMatches(1000, { position: 'FW' }).filter(
      (moments) => moments.filter((m) => m.type === 'shot').length > 1,
    );
    expect(multiple.length).toBeGreaterThan(100);
  });
});

describe('the geometry the pitch is drawn from', () => {
  it('respects each type’s distance range', () => {
    for (const moments of manyMatches(1000)) {
      for (const moment of moments) {
        const [min, max] = MOMENT_GEOMETRY[moment.type].distance;
        expect(moment.distance, moment.type).toBeGreaterThanOrEqual(min);
        expect(moment.distance, moment.type).toBeLessThanOrEqual(max);
      }
    }
  });

  it('respects each type’s angle range', () => {
    for (const moments of manyMatches(1000)) {
      for (const moment of moments) {
        const limit = MOMENT_GEOMETRY[moment.type].angle;
        expect(Math.abs(moment.angle), moment.type).toBeLessThanOrEqual(limit);
      }
    }
  });

  it('puts penalties on the spot, dead centre, every time', () => {
    const penalties = manyMatches(2000)
      .flat()
      .filter((m) => m.type === 'penalty');

    expect(penalties.length).toBeGreaterThan(0);
    for (const penalty of penalties) {
      expect(penalty.distance).toBe(11);
      expect(penalty.angle).toBe(0);
      expect(penalty.defenders).toBe(0);
    }
  });

  it('leaves set pieces unopposed and open play contested', () => {
    const moments = manyMatches(1000).flat();

    for (const moment of moments.filter((m) => m.type === 'free-kick')) {
      expect(moment.defenders).toBe(0);
    }

    const openPlay = moments.filter((m) => m.type === 'shot');
    expect(openPlay.some((m) => m.defenders > 0)).toBe(true);
  });

  it('uses both sides of the pitch', () => {
    const angles = manyMatches(500)
      .flat()
      .filter((m) => m.type === 'shot')
      .map((m) => m.angle);

    expect(angles.some((a) => a < -5)).toBe(true);
    expect(angles.some((a) => a > 5)).toBe(true);
  });
});

describe('determinism', () => {
  it('plans the same match twice', () => {
    const a = generateKeyMoments(context(), keyMomentsRngFor(SEED, 1, 12, 'player-1'));
    const b = generateKeyMoments(context(), keyMomentsRngFor(SEED, 1, 12, 'player-1'));
    expect(a).toEqual(b);
  });

  it('gives different rounds different matches', () => {
    const a = generateKeyMoments(context(), keyMomentsRngFor(SEED, 1, 12, 'player-1'));
    const b = generateKeyMoments(context(), keyMomentsRngFor(SEED, 1, 13, 'player-1'));
    expect(a).not.toEqual(b);
  });
});
