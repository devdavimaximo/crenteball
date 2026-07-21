/**
 * The game state.
 *
 * Plain serializable data — no classes, no Date objects, no functions. It *is*
 * the save file: persisting it is `JSON.stringify`, and loading it needs no
 * reconstruction step that could drift from the original shape.
 *
 * Everything that advances the game is a pure function of this plus a command
 * plus a seeded Rng.
 */
import type { Seed } from '@/engine/rng';

import type { Attributes } from './attributes';
import { createAttributes } from './attributes';
import type { Money } from './money';
import {
  FIRST_SEASON,
  FIRST_WEEK,
  STARTING_AGE,
  STARTING_ATTRIBUTE,
  STARTING_BALANCE,
  STARTING_DEVOTION,
  STARTING_ENERGY,
  STARTING_MORALE,
} from '@/engine/balance/career';

export const POSITIONS = ['GK', 'DF', 'MF', 'FW'] as const;
export type Position = (typeof POSITIONS)[number];

/** Where the career is in time. Weeks are the unit every system ticks on. */
export interface Clock {
  readonly season: number;
  readonly week: number;
}

/** Percentages, 0..100. Both recover; neither is permanent. */
export interface Condition {
  readonly energy: number;
  readonly morale: number;
}

/**
 * The faith pillar.
 *
 * `devotion` replaces the "happiness" stat of the genre: it is fed by the
 * post-match devotional and prayer rather than by possessions, and it feeds
 * back into composure, injury recovery and resistance to bad offers.
 *
 * `lastDevotionalWeek` is null before the first devotional — an absolute week
 * number rather than a date, so the save never depends on a clock.
 */
export interface Faith {
  readonly devotion: number;
  readonly lastDevotionalWeek: number | null;
}

export interface Player {
  readonly id: string;
  readonly name: string;
  readonly position: Position;
  readonly age: number;
  readonly attributes: Attributes;
  readonly condition: Condition;
  readonly faith: Faith;
}

export interface Finances {
  readonly balance: Money;
}

export interface GameState {
  /** Seeds every random decision. Stored so a career is reproducible. */
  readonly seed: Seed;
  /** ISO 8601 string, not a Date: Date is not JSON and does not survive a save. */
  readonly createdAt: string;
  readonly clock: Clock;
  readonly player: Player;
  readonly finances: Finances;
}

export interface NewCareer {
  readonly seed: Seed;
  readonly name: string;
  readonly position: Position;
  /** ISO 8601. Injected rather than read from the clock, so creation is pure. */
  readonly createdAt: string;
  /** Points added on top of the base, per attribute. Validated by the caller. */
  readonly attributes?: Partial<Attributes>;
}

/**
 * Builds the opening state of a career.
 *
 * Pure: same input, same state. No `Date.now()`, no `Math.random()` — both
 * would make saves untestable and careers irreproducible.
 */
export function createInitialState(career: NewCareer): GameState {
  const base = createAttributes(STARTING_ATTRIBUTE);

  return {
    seed: career.seed,
    createdAt: career.createdAt,
    clock: { season: FIRST_SEASON, week: FIRST_WEEK },
    player: {
      id: `player-${String(career.seed)}`,
      name: career.name,
      position: career.position,
      age: STARTING_AGE,
      attributes: { ...base, ...career.attributes },
      condition: { energy: STARTING_ENERGY, morale: STARTING_MORALE },
      faith: { devotion: STARTING_DEVOTION, lastDevotionalWeek: null },
    },
    finances: { balance: STARTING_BALANCE },
  };
}
