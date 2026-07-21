/**
 * Deterministic seeded randomness.
 *
 * Same state + same seed + same action = same result, always. Every random
 * decision in the engine flows through here; `Math.random()` is banned by lint
 * inside engine/ (see eslint.config.js).
 *
 * This buys us, for free:
 *   - reproducible tests and reproducible balance runs
 *   - match replays from a seed plus a MatchEvent log
 *   - a bug report that is a save file, not a story
 */

/** A 32-bit unsigned integer. Stored in the save. */
export type Seed = number;

/**
 * Members are declared as function properties, not methods, on purpose: the
 * implementations are closures that never touch `this`, so `rng.next` can be
 * passed around detached (`Array.from({ length: n }, rng.next)`) without the
 * usual unbound-method footgun.
 */
export interface Rng {
  /** The seed this generator was created from. Safe to persist. */
  readonly seed: Seed;

  /** Uniform float in [0, 1). */
  next: () => number;

  /** Uniform integer in [min, max], both inclusive. */
  int: (min: number, max: number) => number;

  /** Uniform float in [min, max). */
  float: (min: number, max: number) => number;

  /** True with the given probability (0..1). `chance(0.25)` = 25% of the time. */
  chance: (probability: number) => boolean;

  /** One item, uniformly. Throws on an empty list. */
  pick: <T>(items: readonly T[]) => T;

  /** One item, proportional to its weight. Throws if no weight is positive. */
  weighted: <T>(entries: readonly (readonly [T, number])[]) => T;

  /**
   * Normally distributed value. Most football quantities (attributes in a
   * squad, crowd size, a striker's finishing on the day) cluster around a mean
   * — a uniform roll would make every generated world feel flat.
   */
  gaussian: (mean: number, stdDev: number) => number;

  /** A shuffled copy. The input is not mutated. */
  shuffle: <T>(items: readonly T[]) => T[];

  /**
   * An independent generator for a sub-context.
   *
   * This is what keeps determinism usable in practice: deriving a match's Rng
   * from `(season, round, homeClub)` means simulating that match twice gives
   * the same result regardless of what else the player did in between, and
   * adding a new random call to the training system cannot shift the outcome
   * of an unrelated match.
   */
  fork: (...parts: readonly (string | number)[]) => Rng;
}

const UINT32 = 0x100000000;

/**
 * mulberry32 — small, fast, and good enough for a game. Not cryptographic.
 * Chosen over a bigger PRNG because the whole state is a single uint32, which
 * keeps saves tiny and forking cheap.
 */
function mulberry32(seed: Seed): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };
}

/** MurmurHash-style string mixer, used to turn context labels into seeds. */
function hashString(text: string, seed: Seed): Seed {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

/**
 * Derives a stable child seed from a parent seed and a context path.
 * `deriveSeed(save.seed, 'match', 2027, 14)` is the same number every run.
 */
export function deriveSeed(seed: Seed, ...parts: readonly (string | number)[]): Seed {
  // Hashed one part at a time, with a mix step between them, rather than
  // joined into a single string: ('a', 'bc') and ('ab', 'c') then cannot
  // collide without needing a separator character that content ids must avoid.
  let h = seed >>> 0;
  for (const part of parts) {
    h = hashString(String(part), h);
    h = Math.imul(h ^ 0x85ebca6b, 0xc2b2ae35) >>> 0;
  }
  return h >>> 0;
}

export function createRng(seed: Seed): Rng {
  const next = mulberry32(seed);

  const rng: Rng = {
    seed,

    next,

    int(min, max) {
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        throw new RangeError(`int() needs finite bounds, got [${min}, ${max}]`);
      }
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      if (lo > hi) throw new RangeError(`int() needs min <= max, got [${min}, ${max}]`);
      return lo + Math.floor(next() * (hi - lo + 1));
    },

    float(min, max) {
      return min + next() * (max - min);
    },

    chance(probability) {
      return next() < probability;
    },

    pick(items) {
      if (items.length === 0) throw new RangeError('pick() called on an empty list');
      const index = Math.floor(next() * items.length);
      // Safe: index is in [0, length). The assertion satisfies
      // noUncheckedIndexedAccess without paying for a runtime check.
      return items[index] as (typeof items)[number];
    },

    weighted(entries) {
      let total = 0;
      for (const [, weight] of entries) {
        if (weight > 0) total += weight;
      }
      if (total <= 0) throw new RangeError('weighted() needs at least one positive weight');

      let roll = next() * total;
      for (const [value, weight] of entries) {
        if (weight <= 0) continue;
        roll -= weight;
        if (roll < 0) return value;
      }
      // Only reachable through floating-point drift on the final entry.
      const last = entries[entries.length - 1];
      if (!last) throw new RangeError('weighted() called on an empty list');
      return last[0];
    },

    gaussian(mean, stdDev) {
      // Box-Muller. `1 - next()` keeps the input in (0, 1] so log() never blows up.
      const u = 1 - next();
      const v = next();
      const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      return mean + normal * stdDev;
    },

    shuffle(items) {
      const result = [...items];
      // Fisher-Yates, descending.
      for (let i = result.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const a = result[i] as (typeof result)[number];
        const b = result[j] as (typeof result)[number];
        result[i] = b;
        result[j] = a;
      }
      return result;
    },

    fork(...parts) {
      return createRng(deriveSeed(seed, ...parts));
    },
  };

  return rng;
}

/**
 * Turns a human-typed string into a seed, for "start a career from a seed"
 * and for sharing a world with a friend.
 */
export function seedFromString(text: string): Seed {
  return hashString(text, 0x9e3779b9);
}
