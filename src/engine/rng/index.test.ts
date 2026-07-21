import { describe, expect, it } from 'vitest';

import { createRng, deriveSeed, seedFromString } from './index';

const SEED = 20260721;

/** Mean of `samples` draws. Used to assert distributions without flakiness. */
function meanOf(samples: readonly number[]): number {
  return samples.reduce((sum, n) => sum + n, 0) / samples.length;
}

function draw<T>(count: number, produce: () => T): T[] {
  return Array.from({ length: count }, produce);
}

describe('determinism', () => {
  it('two generators with the same seed produce the same stream', () => {
    const a = draw(200, createRng(SEED).next);
    const b = draw(200, createRng(SEED).next);
    expect(a).toEqual(b);
  });

  it('different seeds produce different streams', () => {
    const a = draw(50, createRng(SEED).next);
    const b = draw(50, createRng(SEED + 1).next);
    expect(a).not.toEqual(b);
  });

  it('keeps its seed so it can be persisted in the save', () => {
    expect(createRng(SEED).seed).toBe(SEED);
  });
});

describe('next', () => {
  it('stays within [0, 1)', () => {
    const rng = createRng(SEED);
    for (const value of draw(10_000, rng.next)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('is roughly uniform', () => {
    const rng = createRng(SEED);
    expect(meanOf(draw(50_000, rng.next))).toBeCloseTo(0.5, 2);
  });
});

describe('int', () => {
  it('is inclusive on both ends', () => {
    const rng = createRng(SEED);
    const values = new Set(draw(500, () => rng.int(1, 6)));
    expect([...values].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('handles a single-value range', () => {
    expect(createRng(SEED).int(7, 7)).toBe(7);
  });

  it('handles negative ranges', () => {
    const rng = createRng(SEED);
    for (const value of draw(200, () => rng.int(-5, -1))) {
      expect(value).toBeGreaterThanOrEqual(-5);
      expect(value).toBeLessThanOrEqual(-1);
    }
  });

  it('rejects an inverted range instead of returning nonsense', () => {
    expect(() => createRng(SEED).int(10, 1)).toThrow(RangeError);
  });
});

describe('chance', () => {
  it('never fires at 0 and always fires at 1', () => {
    const rng = createRng(SEED);
    expect(draw(500, () => rng.chance(0)).some(Boolean)).toBe(false);
    expect(draw(500, () => rng.chance(1)).every(Boolean)).toBe(true);
  });

  it('fires at about the requested rate', () => {
    const rng = createRng(SEED);
    const hits = draw(20_000, () => rng.chance(0.3)).filter(Boolean).length;
    expect(hits / 20_000).toBeCloseTo(0.3, 2);
  });
});

describe('pick', () => {
  it('only returns items from the list', () => {
    const rng = createRng(SEED);
    const squad = ['GK', 'DF', 'MF', 'FW'] as const;
    for (const value of draw(300, () => rng.pick(squad))) {
      expect(squad).toContain(value);
    }
  });

  it('reaches every item', () => {
    const rng = createRng(SEED);
    const squad = ['GK', 'DF', 'MF', 'FW'];
    expect(new Set(draw(300, () => rng.pick(squad))).size).toBe(4);
  });

  it('throws on an empty list rather than returning undefined', () => {
    expect(() => createRng(SEED).pick([])).toThrow(RangeError);
  });
});

describe('weighted', () => {
  it('respects the weights', () => {
    const rng = createRng(SEED);
    const entries = [
      ['goal', 1],
      ['save', 3],
    ] as const;

    const goals = draw(20_000, () => rng.weighted(entries)).filter((r) => r === 'goal').length;
    expect(goals / 20_000).toBeCloseTo(0.25, 2);
  });

  it('never returns a zero-weight entry', () => {
    const rng = createRng(SEED);
    const entries = [
      ['impossible', 0],
      ['certain', 5],
    ] as const;
    expect(draw(500, () => rng.weighted(entries))).not.toContain('impossible');
  });

  it('throws when no weight is positive', () => {
    expect(() => createRng(SEED).weighted([['a', 0]])).toThrow(RangeError);
  });
});

describe('gaussian', () => {
  it('centres on the mean with the requested spread', () => {
    const rng = createRng(SEED);
    const samples = draw(20_000, () => rng.gaussian(60, 10));

    expect(meanOf(samples)).toBeCloseTo(60, 0);

    const variance = meanOf(samples.map((n) => (n - 60) ** 2));
    expect(Math.sqrt(variance)).toBeCloseTo(10, 0);
  });

  it('produces finite values (log(0) would give Infinity)', () => {
    const rng = createRng(SEED);
    for (const value of draw(20_000, () => rng.gaussian(0, 1))) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe('shuffle', () => {
  it('does not mutate the input', () => {
    const fixtures = [1, 2, 3, 4, 5];
    createRng(SEED).shuffle(fixtures);
    expect(fixtures).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps exactly the same items', () => {
    const clubs = ['a', 'b', 'c', 'd', 'e', 'f'];
    const shuffled = createRng(SEED).shuffle(clubs);
    expect([...shuffled].sort()).toEqual([...clubs].sort());
  });

  it('actually reorders', () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    expect(createRng(SEED).shuffle(items)).not.toEqual(items);
  });

  it('is deterministic for a given seed', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect(createRng(SEED).shuffle(items)).toEqual(createRng(SEED).shuffle(items));
  });
});

describe('fork', () => {
  it('is stable for the same context', () => {
    const parent = createRng(SEED);
    expect(parent.fork('match', 2027, 14).next()).toBe(parent.fork('match', 2027, 14).next());
  });

  it('gives different streams to different contexts', () => {
    const parent = createRng(SEED);
    expect(parent.fork('match', 2027, 14).next()).not.toBe(parent.fork('match', 2027, 15).next());
  });

  it('is independent of how much the parent has been consumed', () => {
    // This is the property that matters: adding a random call to the training
    // system must not change the outcome of an unrelated match.
    const parent = createRng(SEED);
    const before = parent.fork('match', 2027, 14).next();

    draw(137, parent.next);

    expect(parent.fork('match', 2027, 14).next()).toBe(before);
  });
});

describe('deriveSeed', () => {
  it('is stable across runs', () => {
    expect(deriveSeed(SEED, 'match', 2027, 14)).toBe(deriveSeed(SEED, 'match', 2027, 14));
  });

  it('does not collide when part boundaries shift', () => {
    expect(deriveSeed(SEED, 'a', 'bc')).not.toBe(deriveSeed(SEED, 'ab', 'c'));
  });

  it('is order sensitive', () => {
    expect(deriveSeed(SEED, 'a', 'b')).not.toBe(deriveSeed(SEED, 'b', 'a'));
  });

  it('returns a uint32', () => {
    const derived = deriveSeed(SEED, 'season', 3);
    expect(Number.isInteger(derived)).toBe(true);
    expect(derived).toBeGreaterThanOrEqual(0);
    expect(derived).toBeLessThan(0x100000000);
  });
});

describe('seedFromString', () => {
  it('maps a typed seed to the same world every time', () => {
    expect(seedFromString('crenteball')).toBe(seedFromString('crenteball'));
  });

  it('distinguishes similar strings', () => {
    expect(seedFromString('crenteball')).not.toBe(seedFromString('crenteballl'));
  });
});
