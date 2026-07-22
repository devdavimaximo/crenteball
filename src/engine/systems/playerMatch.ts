/**
 * The match the player plays.
 *
 * The whole fixture is planned up front from a seeded Rng: his key moments,
 * and the minutes his teammates and the opposition score. What he does with
 * his moments is the only thing left open — which is exactly the game.
 *
 * Planning it all at once matters: it means the scoreline is not being
 * quietly rigged around his performance, and a replay from the same seed
 * puts the same match in front of him.
 */
import {
  AWAY_ATTACK_MULTIPLIER,
  HOME_ATTACK_MULTIPLIER,
} from '@/engine/balance/match';
import {
  BASE_PRESSURE,
  BLOWOUT_RELIEF,
  LATE_MATCH_PRESSURE,
  MAX_PRESSURE,
  PENALTY_PRESSURE_FLOOR,
  PRESSURE_RAMP_FROM,
  TEAMMATE_GOAL_SHARE,
  TIGHT_GAME_PRESSURE,
} from '@/engine/balance/playerMatch';
import type { Position } from '@/engine/domain/state';
import type { Rng, Seed } from '@/engine/rng';
import { createRng, deriveSeed } from '@/engine/rng';
import { poisson } from '@/engine/rng/distributions';
import { generateKeyMoments } from '@/engine/sim/keyMoments';
import type { KeyMoment } from '@/engine/sim/keyMoments';
import { expectedGoals } from '@/engine/sim/match';

export const MATCH_MINUTES = 90;

export interface PlayerMatchSetup {
  readonly position: Position;
  readonly teamStrength: number;
  readonly opponentStrength: number;
  readonly isHome: boolean;
  /** 0..100. */
  readonly energy: number;
}

export interface PlannedMatch {
  readonly moments: readonly KeyMoment[];
  /** Minutes his teammates scored, ascending. */
  readonly teammateGoalMinutes: readonly number[];
  /** Minutes the opposition scored, ascending. */
  readonly opponentGoalMinutes: readonly number[];
}

export interface Scoreline {
  readonly team: number;
  readonly opponent: number;
}

function goalMinutes(count: number, rng: Rng): number[] {
  return Array.from({ length: count }, () => rng.int(1, MATCH_MINUTES)).sort((a, b) => a - b);
}

export function planMatch(setup: PlayerMatchSetup, rng: Rng): PlannedMatch {
  const moments = generateKeyMoments(
    {
      position: setup.position,
      teamStrength: setup.teamStrength,
      opponentStrength: setup.opponentStrength,
      isHome: setup.isHome,
      energy: setup.energy,
    },
    rng,
  );

  const teamVenue = setup.isHome ? HOME_ATTACK_MULTIPLIER : AWAY_ATTACK_MULTIPLIER;
  const opponentVenue = setup.isHome ? AWAY_ATTACK_MULTIPLIER : HOME_ATTACK_MULTIPLIER;

  const teammateXG =
    expectedGoals(setup.teamStrength, setup.opponentStrength, teamVenue) * TEAMMATE_GOAL_SHARE;
  const opponentXG = expectedGoals(setup.opponentStrength, setup.teamStrength, opponentVenue);

  return {
    moments,
    teammateGoalMinutes: goalMinutes(poisson(rng, teammateXG), rng),
    opponentGoalMinutes: goalMinutes(poisson(rng, opponentXG), rng),
  };
}

/**
 * The scoreline as it stood at a given minute.
 *
 * Derived rather than accumulated so that rewinding, replaying or rendering
 * an earlier moment can never disagree with the live match.
 */
export function scoreAt(
  plan: PlannedMatch,
  playerGoalMinutes: readonly number[],
  minute: number,
): Scoreline {
  const before = (minutes: readonly number[]) => minutes.filter((m) => m <= minute).length;

  return {
    team: before(plan.teammateGoalMinutes) + before(playerGoalMinutes),
    opponent: before(plan.opponentGoalMinutes),
  };
}

export function finalScore(
  plan: PlannedMatch,
  playerGoalMinutes: readonly number[],
): Scoreline {
  return scoreAt(plan, playerGoalMinutes, MATCH_MINUTES);
}

/**
 * How much a moment weighs on the player, 0..1.
 *
 * Climbs through the closing half hour and with how close the game is; a
 * three-goal gap either way lets the air out. This is the number composure —
 * and therefore devotion — exists to answer.
 */
export function pressureFor(
  plan: PlannedMatch,
  playerGoalMinutes: readonly number[],
  moment: KeyMoment,
): number {
  const score = scoreAt(plan, playerGoalMinutes, moment.minute);
  const margin = Math.abs(score.team - score.opponent);

  const lateness = Math.max(
    0,
    (moment.minute - PRESSURE_RAMP_FROM) / (MATCH_MINUTES - PRESSURE_RAMP_FROM),
  );

  let pressure = BASE_PRESSURE + Math.min(1, lateness) * LATE_MATCH_PRESSURE;
  if (margin <= 1) pressure += TIGHT_GAME_PRESSURE;
  if (margin >= 3) pressure -= BLOWOUT_RELIEF;

  // Standing over a penalty is its own occasion, whatever the scoreline.
  if (moment.type === 'penalty') pressure = Math.max(pressure, PENALTY_PRESSURE_FLOOR);

  return Math.min(MAX_PRESSURE, Math.max(0, pressure));
}

/** The deterministic Rng for one of the player's fixtures. */
export function playerMatchRngFor(
  seed: Seed,
  season: number,
  round: number,
  playerId: string,
): Rng {
  return createRng(deriveSeed(seed, 'player-match', season, round, playerId));
}
