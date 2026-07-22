import { describe, expect, it } from 'vitest';

import { BASE_RATING, MAX_RATING, MIN_RATING } from '@/engine/balance/rating';

import { matchPerformance, ratingBand, shotContribution } from './rating';
import type { RatedShot } from './rating';

const shot = (outcome: RatedShot['outcome'], quality = 0.3): RatedShot => ({ outcome, quality });

describe('a match with nothing in it', () => {
  it('rates an anonymous afternoon at the base', () => {
    expect(matchPerformance([]).rating).toBe(BASE_RATING);
  });

  it('reports empty tallies', () => {
    expect(matchPerformance([])).toEqual({
      rating: BASE_RATING,
      goals: 0,
      shots: 0,
      shotsOnTarget: 0,
    });
  });
});

describe('goals', () => {
  it('lifts the rating', () => {
    expect(matchPerformance([shot('goal')]).rating).toBeGreaterThan(BASE_RATING);
  });

  it('is worth more the harder the chance was', () => {
    // The design rule that stops the game rewarding only poachers.
    const worldClass = shotContribution(shot('goal', 0.05));
    const tapIn = shotContribution(shot('goal', 0.95));
    expect(worldClass).toBeGreaterThan(tapIn);
  });

  it('still rewards a tap-in — a goal is a goal', () => {
    expect(shotContribution(shot('goal', 1))).toBeGreaterThan(0);
  });

  it('stacks across a hat-trick', () => {
    const one = matchPerformance([shot('goal')]).rating;
    const three = matchPerformance([shot('goal'), shot('goal'), shot('goal')]).rating;
    expect(three).toBeGreaterThan(one);
  });
});

describe('misses', () => {
  it('costs more to miss a good chance than a bad one', () => {
    const sitter = shotContribution(shot('off-target', 0.9));
    const halfChance = shotContribution(shot('off-target', 0.1));
    expect(sitter).toBeLessThan(halfChance);
  });

  it('barely punishes a half-chance dragged wide', () => {
    expect(shotContribution(shot('off-target', 0.05))).toBeGreaterThan(-0.15);
  });

  it('treats a save as far less damning than a miss', () => {
    expect(shotContribution(shot('saved', 0.8))).toBeGreaterThan(
      shotContribution(shot('off-target', 0.8)),
    );
  });

  it('treats the woodwork as bad luck', () => {
    expect(shotContribution(shot('post', 0.8))).toBeGreaterThan(
      shotContribution(shot('saved', 0.8)),
    );
  });

  it('blames a block on the defender more than the shooter', () => {
    expect(shotContribution(shot('blocked', 0.8))).toBeGreaterThan(
      shotContribution(shot('off-target', 0.8)),
    );
  });
});

describe('the rating stays a rating', () => {
  it('never exceeds ten, however many goals', () => {
    const tenGoals = Array.from({ length: 10 }, () => shot('goal', 0));
    expect(matchPerformance(tenGoals).rating).toBe(MAX_RATING);
  });

  it('never drops below one, however bad the afternoon', () => {
    const disaster = Array.from({ length: 20 }, () => shot('off-target', 1));
    expect(matchPerformance(disaster).rating).toBe(MIN_RATING);
  });

  it('is shown to one decimal', () => {
    const rating = matchPerformance([shot('goal', 0.37), shot('saved', 0.61)]).rating;
    expect(rating).toBe(Number(rating.toFixed(1)));
  });

  it('is recomputed from the whole list, so live and final agree', () => {
    const shots = [shot('goal', 0.4), shot('off-target', 0.7), shot('saved', 0.2)];
    const incremental = shots.map((_, i) => matchPerformance(shots.slice(0, i + 1)).rating);
    expect(incremental[incremental.length - 1]).toBe(matchPerformance(shots).rating);
  });
});

describe('tallies', () => {
  it('counts goals, shots and shots on target', () => {
    const performance = matchPerformance([
      shot('goal'),
      shot('saved'),
      shot('off-target'),
      shot('blocked'),
      shot('post'),
    ]);

    expect(performance.goals).toBe(1);
    expect(performance.shots).toBe(5);
    // A block never reached the goal; the woodwork was not on target either.
    expect(performance.shotsOnTarget).toBe(2);
  });
});

describe('ratingBand', () => {
  it('bands a performance the same way on every screen', () => {
    expect(ratingBand(9.1)).toBe('standout');
    expect(ratingBand(8)).toBe('standout');
    expect(ratingBand(6.4)).toBe('solid');
    expect(ratingBand(5)).toBe('solid');
    expect(ratingBand(4.9)).toBe('poor');
  });
});

describe('a plausible afternoon', () => {
  it('rates a striker who scored once and missed once around a good seven', () => {
    const performance = matchPerformance([
      shot('goal', 0.25),
      shot('off-target', 0.35),
      shot('saved', 0.4),
    ]);

    expect(performance.rating).toBeGreaterThan(6);
    expect(performance.rating).toBeLessThan(8);
  });

  it('rates a striker who missed three good chances as poor', () => {
    const performance = matchPerformance([
      shot('off-target', 0.75),
      shot('off-target', 0.6),
      shot('off-target', 0.8),
    ]);

    expect(ratingBand(performance.rating)).toBe('poor');
  });
});
