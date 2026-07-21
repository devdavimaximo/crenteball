/**
 * Statistical simulation of a match between two AI clubs.
 *
 * This is the *fast* half of the two-speed world: matches the player is not
 * in are resolved as a scoreline plus scorers, with no minute-by-minute
 * detail. The player's own matches are a different system entirely (the
 * interactive key moments), and nothing here is reused for them.
 *
 * Goals are drawn from a Poisson distribution around an expected value
 * derived from squad strength. Poisson is the standard model for football
 * scorelines: it produces plenty of 1-0s and 2-1s, the occasional 4-0, and
 * almost never a 9-8.
 */
import {
  AWAY_ATTACK_MULTIPLIER,
  BASE_EXPECTED_GOALS,
  FINISHING_REFERENCE,
  HOME_ATTACK_MULTIPLIER,
  MATCH_MINUTES,
  MAX_EXPECTED_GOALS,
  MIN_EXPECTED_GOALS,
  SCORING_WEIGHT_BY_POSITION,
  STRENGTH_SCALE,
} from '@/engine/balance/match';
import type { Rng, Seed } from '@/engine/rng';
import { createRng, deriveSeed } from '@/engine/rng';

import type { SquadPlayer } from './squad';
import { squadStrength } from './squad';

export interface MatchTeam {
  readonly clubId: string;
  readonly squad: readonly SquadPlayer[];
}

export interface Goal {
  readonly clubId: string;
  readonly playerId: string;
  readonly playerName: string;
  readonly minute: number;
}

export interface MatchResult {
  readonly homeClubId: string;
  readonly awayClubId: string;
  readonly homeGoals: number;
  readonly awayGoals: number;
  /** In chronological order. Length always equals homeGoals + awayGoals. */
  readonly goals: readonly Goal[];
}

/**
 * Expected goals for one side against the other.
 *
 * Exported for the balance harness, which plots it across the reputation
 * range to check the league is competitive before any season is simulated.
 */
export function expectedGoals(
  attackStrength: number,
  defenceStrength: number,
  venueMultiplier: number,
): number {
  const raw =
    BASE_EXPECTED_GOALS *
    Math.exp((attackStrength - defenceStrength) / STRENGTH_SCALE) *
    venueMultiplier;

  return Math.min(MAX_EXPECTED_GOALS, Math.max(MIN_EXPECTED_GOALS, raw));
}

/**
 * Knuth's Poisson sampler.
 *
 * Kept local rather than added to the Rng interface: this is the only caller,
 * and a distribution nobody else uses does not belong in the shared surface.
 * Promote it if a second system ever needs it.
 */
function samplePoisson(rng: Rng, lambda: number): number {
  const limit = Math.exp(-lambda);
  let count = 0;
  let product = rng.next();

  while (product > limit) {
    count += 1;
    product *= rng.next();
    // Guard against a pathological lambda producing an unbounded loop.
    if (count > 20) break;
  }

  return count;
}

/**
 * Picks who scored.
 *
 * Weighted by position and finishing, so a striker with 80 finishing scores
 * far more often than a centre-back — without ever making it impossible for
 * the centre-back to head one in from a corner.
 */
function pickScorer(squad: readonly SquadPlayer[], rng: Rng): SquadPlayer {
  const entries = squad.map(
    (player) =>
      [
        player,
        SCORING_WEIGHT_BY_POSITION[player.position] *
          (player.attributes.finishing / FINISHING_REFERENCE),
      ] as const,
  );

  const scorable = entries.filter(([, weight]) => weight > 0);
  if (scorable.length === 0) {
    // A squad of nothing but keepers should still not crash a season.
    return rng.pick(squad);
  }

  return rng.weighted(scorable);
}

export function simulateMatch(home: MatchTeam, away: MatchTeam, rng: Rng): MatchResult {
  const homeStrength = squadStrength(home.squad);
  const awayStrength = squadStrength(away.squad);

  const homeGoals = samplePoisson(
    rng,
    expectedGoals(homeStrength, awayStrength, HOME_ATTACK_MULTIPLIER),
  );
  const awayGoals = samplePoisson(
    rng,
    expectedGoals(awayStrength, homeStrength, AWAY_ATTACK_MULTIPLIER),
  );

  const goals: Goal[] = [];

  const addGoals = (team: MatchTeam, count: number): void => {
    for (let i = 0; i < count; i += 1) {
      const scorer = pickScorer(team.squad, rng);
      goals.push({
        clubId: team.clubId,
        playerId: scorer.id,
        playerName: scorer.name,
        minute: rng.int(1, MATCH_MINUTES),
      });
    }
  };

  addGoals(home, homeGoals);
  addGoals(away, awayGoals);

  goals.sort((a, b) => a.minute - b.minute);

  return { homeClubId: home.clubId, awayClubId: away.clubId, homeGoals, awayGoals, goals };
}

/** The deterministic Rng for one fixture. */
export function matchRngFor(
  seed: Seed,
  season: number,
  round: number,
  homeClubId: string,
): Rng {
  return createRng(deriveSeed(seed, 'match', season, round, homeClubId));
}
