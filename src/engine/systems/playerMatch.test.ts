import { describe, expect, it } from 'vitest';

import { PENALTY_PRESSURE_FLOOR } from '@/engine/balance/playerMatch';
import { createRng } from '@/engine/rng';
import type { KeyMoment } from '@/engine/sim/keyMoments';

import {
  finalScore,
  MATCH_MINUTES,
  planMatch,
  playerMatchRngFor,
  pressureFor,
  scoreAt,
} from './playerMatch';
import type { PlannedMatch, PlayerMatchSetup } from './playerMatch';

const SEED = 20260721;

function setup(overrides: Partial<PlayerMatchSetup> = {}): PlayerMatchSetup {
  return {
    position: 'FW',
    teamStrength: 55,
    opponentStrength: 55,
    isHome: true,
    energy: 100,
    ...overrides,
  };
}

function plans(count: number, overrides: Partial<PlayerMatchSetup> = {}): PlannedMatch[] {
  const rng = createRng(SEED);
  return Array.from({ length: count }, () => planMatch(setup(overrides), rng));
}

function moment(overrides: Partial<KeyMoment> = {}): KeyMoment {
  return {
    id: 'm',
    minute: 30,
    type: 'shot',
    distance: 16,
    angle: 0,
    defenders: 1,
    ...overrides,
  };
}

describe('planMatch', () => {
  it('gives the player his moments', () => {
    for (const plan of plans(200)) {
      expect(plan.moments.length).toBeGreaterThanOrEqual(3);
      expect(plan.moments.length).toBeLessThanOrEqual(6);
    }
  });

  it('keeps every goal inside the ninety minutes, in order', () => {
    for (const plan of plans(300)) {
      for (const minutes of [plan.teammateGoalMinutes, plan.opponentGoalMinutes]) {
        expect([...minutes].sort((a, b) => a - b)).toEqual([...minutes]);
        for (const m of minutes) {
          expect(m).toBeGreaterThanOrEqual(1);
          expect(m).toBeLessThanOrEqual(MATCH_MINUTES);
        }
      }
    }
  });

  it('leaves room for the player to be decisive', () => {
    // Teammates must not score so freely that his goals are decoration.
    const all = plans(600);
    const teammateGoals = all.reduce((sum, p) => sum + p.teammateGoalMinutes.length, 0);
    expect(teammateGoals / all.length).toBeLessThan(1.6);
  });

  it('concedes more against a stronger opponent', () => {
    const mean = (list: PlannedMatch[]) =>
      list.reduce((sum, p) => sum + p.opponentGoalMinutes.length, 0) / list.length;

    expect(mean(plans(400, { opponentStrength: 75 }))).toBeGreaterThan(
      mean(plans(400, { opponentStrength: 35 })),
    );
  });

  it('scores more at home than away', () => {
    const mean = (list: PlannedMatch[]) =>
      list.reduce((sum, p) => sum + p.teammateGoalMinutes.length, 0) / list.length;

    expect(mean(plans(600, { isHome: true }))).toBeGreaterThan(
      mean(plans(600, { isHome: false })),
    );
  });

  it('plans the same fixture identically from the same seed', () => {
    const a = planMatch(setup(), playerMatchRngFor(SEED, 1, 7, 'p1'));
    const b = planMatch(setup(), playerMatchRngFor(SEED, 1, 7, 'p1'));
    expect(a).toEqual(b);
  });

  it('plans a different fixture for a different round', () => {
    const a = planMatch(setup(), playerMatchRngFor(SEED, 1, 7, 'p1'));
    const b = planMatch(setup(), playerMatchRngFor(SEED, 1, 8, 'p1'));
    expect(a).not.toEqual(b);
  });
});

describe('scoreAt', () => {
  const plan: PlannedMatch = {
    moments: [],
    teammateGoalMinutes: [12, 70],
    opponentGoalMinutes: [40],
  };

  it('counts only what has happened by that minute', () => {
    expect(scoreAt(plan, [], 5)).toEqual({ team: 0, opponent: 0 });
    expect(scoreAt(plan, [], 12)).toEqual({ team: 1, opponent: 0 });
    expect(scoreAt(plan, [], 45)).toEqual({ team: 1, opponent: 1 });
    expect(scoreAt(plan, [], 90)).toEqual({ team: 2, opponent: 1 });
  });

  it('includes the player’s own goals', () => {
    expect(scoreAt(plan, [30], 35)).toEqual({ team: 2, opponent: 0 });
  });

  it('agrees with the final score at full time', () => {
    expect(finalScore(plan, [88])).toEqual(scoreAt(plan, [88], MATCH_MINUTES));
    expect(finalScore(plan, [88])).toEqual({ team: 3, opponent: 1 });
  });

  it('is derived, so a late goal never rewrites an earlier scoreline', () => {
    const early = scoreAt(plan, [88], 20);
    expect(early).toEqual(scoreAt(plan, [], 20));
  });
});

describe('pressureFor', () => {
  const level: PlannedMatch = { moments: [], teammateGoalMinutes: [], opponentGoalMinutes: [] };

  it('stays low early in a quiet game', () => {
    expect(pressureFor(level, [], moment({ minute: 10 }))).toBeLessThan(0.5);
  });

  it('climbs as the match runs out', () => {
    expect(pressureFor(level, [], moment({ minute: 88 }))).toBeGreaterThan(
      pressureFor(level, [], moment({ minute: 20 })),
    );
  });

  it('is highest when the game is late and tight', () => {
    const tightLate = pressureFor(level, [], moment({ minute: 89 }));
    expect(tightLate).toBeGreaterThan(0.7);
  });

  it('lets the air out of a blowout', () => {
    const blowout: PlannedMatch = {
      moments: [],
      teammateGoalMinutes: [10, 20, 30, 40],
      opponentGoalMinutes: [],
    };
    expect(pressureFor(blowout, [], moment({ minute: 85 }))).toBeLessThan(
      pressureFor(level, [], moment({ minute: 85 })),
    );
  });

  it('treats a penalty as an occasion whatever the scoreline', () => {
    const blowout: PlannedMatch = {
      moments: [],
      teammateGoalMinutes: [5, 10, 15, 20],
      opponentGoalMinutes: [],
    };
    expect(
      pressureFor(blowout, [], moment({ minute: 12, type: 'penalty' })),
    ).toBeGreaterThanOrEqual(PENALTY_PRESSURE_FLOOR);
  });

  it('stays a probability in every situation', () => {
    for (const minute of [1, 30, 60, 90]) {
      for (const goals of [[], [1, 2, 3, 4, 5]]) {
        const p = pressureFor(level, goals, moment({ minute }));
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    }
  });
});
