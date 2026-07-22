/**
 * The player's match rating.
 *
 * Pure accumulation over what he did with the moments he was given. It is
 * recomputed from the full list every time rather than nudged incrementally,
 * so the rating shown live during a match and the one written to the season
 * record can never drift apart.
 */
import {
  BASE_RATING,
  BLOCKED_PENALTY,
  GOAL_BASE,
  GOAL_DIFFICULTY_BONUS,
  MAX_RATING,
  MIN_RATING,
  OFF_TARGET_PENALTY,
  ON_TARGET_CREDIT,
  POOR_RATING,
  POST_PENALTY,
  RATING_DECIMALS,
  SAVED_PENALTY,
  STANDOUT_RATING,
} from '@/engine/balance/rating';
import type { ShotOutcome } from '@/engine/sim/shot';

/** One resolved moment, as the rating sees it. */
export interface RatedShot {
  readonly outcome: ShotOutcome;
  /** `chanceQuality` of the moment: 0 impossible, 1 a certainty. */
  readonly quality: number;
}

export interface MatchPerformance {
  readonly rating: number;
  readonly goals: number;
  readonly shots: number;
  readonly shotsOnTarget: number;
}

/** How much a single shot moved the rating. Exported for post-match breakdowns. */
export function shotContribution(shot: RatedShot): number {
  const quality = Math.min(1, Math.max(0, shot.quality));

  switch (shot.outcome) {
    case 'goal':
      // The harder the chance, the more the finish is worth.
      return GOAL_BASE + (1 - quality) * GOAL_DIFFICULTY_BONUS;

    case 'saved':
      return ON_TARGET_CREDIT - quality * SAVED_PENALTY;

    case 'post':
      return ON_TARGET_CREDIT - quality * POST_PENALTY;

    case 'off-target':
      return -quality * OFF_TARGET_PENALTY;

    case 'blocked':
      return -quality * BLOCKED_PENALTY;
  }
}

function round(value: number): number {
  const factor = 10 ** RATING_DECIMALS;
  return Math.round(value * factor) / factor;
}

export function matchPerformance(shots: readonly RatedShot[]): MatchPerformance {
  const raw = shots.reduce((total, shot) => total + shotContribution(shot), BASE_RATING);

  return {
    rating: round(Math.min(MAX_RATING, Math.max(MIN_RATING, raw))),
    goals: shots.filter((shot) => shot.outcome === 'goal').length,
    shots: shots.length,
    shotsOnTarget: shots.filter(
      (shot) => shot.outcome === 'goal' || shot.outcome === 'saved',
    ).length,
  };
}

export type RatingBand = 'standout' | 'solid' | 'poor';

/** Which band a rating falls in, so every screen colours it the same way. */
export function ratingBand(rating: number): RatingBand {
  if (rating >= STANDOUT_RATING) return 'standout';
  if (rating < POOR_RATING) return 'poor';
  return 'solid';
}
