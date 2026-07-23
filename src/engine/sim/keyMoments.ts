/**
 * The player's decisive moments in a match.
 *
 * This is the *slow* half of the two-speed world. Matches the player is not
 * in resolve as a scoreline (see match.ts); the match he plays stops at three
 * to six moments where what he does decides what happens.
 *
 * This module answers "what happens, and where" — the moment's type, its
 * minute, and the geometry the pitch will be drawn from. How it turns out is
 * a separate concern, because the outcome depends on the player's input and
 * on a scoreline that does not exist yet when the match is planned.
 */
import type { KeyMomentType } from '@/engine/balance/keyMoments';
import {
  BASE_MOMENTS,
  ENERGY_REFERENCE,
  FIRST_POSSIBLE_MINUTE,
  HOME_MOMENT_BONUS,
  LAST_POSSIBLE_MINUTE,
  MAX_DEFENDERS,
  MAX_ENERGY_MOMENT_PENALTY,
  MAX_MOMENTS,
  MIN_MINUTES_BETWEEN_MOMENTS,
  MIN_MOMENTS,
  MOMENT_GEOMETRY,
  MOMENT_WEIGHTS,
  MOMENTS_PER_STRENGTH_POINT,
  SIGNATURE_MOMENT,
  UNOPPOSED_TYPES,
} from '@/engine/balance/keyMoments';
import type { Position } from '@/engine/domain/state';
import type { Rng, Seed } from '@/engine/rng';
import { createRng, deriveSeed } from '@/engine/rng';

export type { KeyMomentType };

export interface KeyMoment {
  readonly id: string;
  readonly minute: number;
  readonly type: KeyMomentType;
  /** Metres from the goal the player is attacking (or defending, for tackles). */
  readonly distance: number;
  /** Degrees off the centre line. Negative is left, positive is right. */
  readonly angle: number;
  /** Opponents in the way. Set pieces are unopposed by definition. */
  readonly defenders: number;
}

/** What the engine needs to know to plan a match. */
export interface MatchPlanContext {
  readonly position: Position;
  readonly teamStrength: number;
  readonly opponentStrength: number;
  readonly isHome: boolean;
  /** 0..100. A tired player drifts out of the game. */
  readonly energy: number;
}

/**
 * How many moments this match gives the player.
 *
 * Kept separate and exported so the balance harness can plot it across the
 * strength range without generating whole matches.
 */
export function momentCountFor(context: MatchPlanContext, rng: Rng): number {
  const dominance = (context.teamStrength - context.opponentStrength) * MOMENTS_PER_STRENGTH_POINT;
  const homeBonus = context.isHome ? HOME_MOMENT_BONUS : 0;

  const tiredness = Math.max(0, ENERGY_REFERENCE - context.energy) / ENERGY_REFERENCE;
  const energyPenalty = tiredness * MAX_ENERGY_MOMENT_PENALTY;

  const expected = BASE_MOMENTS + dominance + homeBonus - energyPenalty;

  // Rounded stochastically: an expected 4.3 should give five moments 30% of
  // the time, not four every time. Rounding down would quietly shave a
  // moment off every match for the weaker side.
  const floor = Math.floor(expected);
  const count = rng.chance(expected - floor) ? floor + 1 : floor;

  return Math.min(MAX_MOMENTS, Math.max(MIN_MOMENTS, count));
}

/** Picks a moment type for a position, weighted. Shared with the spatial generator. */
export function pickMomentType(position: Position, rng: Rng): KeyMomentType {
  const weights = MOMENT_WEIGHTS[position];
  const entries = Object.entries(weights)
    .filter(([, weight]) => weight > 0)
    .map(([type, weight]) => [type as KeyMomentType, weight] as const);

  return rng.weighted(entries);
}

function geometryFor(type: KeyMomentType, rng: Rng): { distance: number; angle: number } {
  const spec = MOMENT_GEOMETRY[type];
  const [min, max] = spec.distance;

  return {
    distance: min === max ? min : Math.round(rng.float(min, max) * 10) / 10,
    angle: spec.angle === 0 ? 0 : Math.round(rng.float(-spec.angle, spec.angle)),
  };
}

/**
 * Spreads `count` minutes across the match without bunching.
 *
 * The match is divided into equal windows and one minute is drawn from each,
 * which guarantees the spacing instead of rejecting and retrying draws. A
 * player should never face two decisive moments in the same passage of play.
 */
/** Spreads `count` minutes across the match without bunching. Shared. */
export function spreadMinutes(count: number, rng: Rng): number[] {
  const span = LAST_POSSIBLE_MINUTE - FIRST_POSSIBLE_MINUTE;
  const window = span / count;

  const minutes: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = FIRST_POSSIBLE_MINUTE + window * i;
    // Leave a margin at the end of each window so neighbouring draws cannot
    // land on top of each other.
    const end = start + Math.max(1, window - MIN_MINUTES_BETWEEN_MOMENTS / 2);
    minutes.push(Math.round(rng.float(start, Math.min(end, LAST_POSSIBLE_MINUTE))));
  }

  return minutes.sort((a, b) => a - b);
}

export function generateKeyMoments(context: MatchPlanContext, rng: Rng): KeyMoment[] {
  const count = momentCountFor(context, rng);
  const minutes = spreadMinutes(count, rng);

  const types = minutes.map(() => pickMomentType(context.position, rng));

  // Guarantee the player's signature moment. Drawn independently rather than
  // forced into a fixed slot, so it is not always the same minute of the match.
  const signature = SIGNATURE_MOMENT[context.position];
  if (!types.includes(signature)) {
    types[rng.int(0, types.length - 1)] = signature;
  }

  return minutes.map((minute, index) => {
    const type = types[index] as KeyMomentType;
    const { distance, angle } = geometryFor(type, rng);

    return {
      id: `moment-${String(index)}-${String(minute)}`,
      minute,
      type,
      distance,
      angle,
      defenders: UNOPPOSED_TYPES.includes(type) ? 0 : rng.int(0, MAX_DEFENDERS),
    };
  });
}

/** The deterministic Rng for planning one of the player's matches. */
export function keyMomentsRngFor(
  seed: Seed,
  season: number,
  round: number,
  playerId: string,
): Rng {
  return createRng(deriveSeed(seed, 'key-moments', season, round, playerId));
}
