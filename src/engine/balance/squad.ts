/**
 * Tuning for AI squad generation.
 *
 * These numbers decide how strong a club "feels" relative to its reputation,
 * which in turn decides whether a season is a fair fight or a walkover. When
 * `sim:seasons` reports that the title race is decided by November, this is
 * the file to open.
 */
import type { AttributeKey } from '@/engine/domain/attributes';
import type { Position } from '@/engine/domain/state';

/** 22 players: enough for rotation, injuries and a bench that means something. */
export const SQUAD_SIZE = 22;

export const SQUAD_COMPOSITION: Readonly<Record<Position, number>> = {
  GK: 3,
  DF: 7,
  MF: 7,
  FW: 5,
};

/**
 * Maps club reputation (1..100) onto average squad skill.
 *
 * Deliberately compressed rather than proportional: a reputation-31 club
 * fields professionals, not amateurs, so its squad sits around 42 rather than
 * near zero. The gap to a reputation-88 club (~73) is what makes a title race
 * hard but not impossible — and what makes signing for a big club feel like a
 * step up rather than a different sport.
 */
export const SKILL_BASE = 25;
export const SKILL_PER_REPUTATION = 0.55;

/** Spread of player quality *within* one squad: stars, starters and squad filler. */
export const SQUAD_SKILL_SPREAD = 6;

/** Spread between a single player's own six attributes. */
export const ATTRIBUTE_SPREAD = 5;

/** Ages cluster around peak years, with youth and veterans in the tails. */
export const AGE_MEAN = 26;
export const AGE_SPREAD = 4.5;
export const AGE_MIN = 17;
export const AGE_MAX = 38;

/**
 * The development curve.
 *
 * A player is generated with a *peak* ability, then scaled down by how far he
 * is from his peak years. Without this, age and ability are independent rolls
 * and a 17-year-old ends up being his club's best player as often as a
 * 27-year-old — which reads as broken the moment anyone looks at a squad list.
 *
 * A teenager at 72% of his peak is a promising kid who needs games; the same
 * kid at 100% would be a finished article at seventeen.
 */
export const PEAK_AGE = 27;

/** Fraction of peak ability a player has at AGE_MIN. */
export const MATURITY_AT_MIN_AGE = 0.72;

/** Ability lost per year past the peak. Eleven years takes a 38-year-old to ~87%. */
export const DECLINE_PER_YEAR = 0.012;

/**
 * Average maturity across the generated age distribution, used to re-centre
 * peak ability so a club's *current* average strength still matches
 * `skillForReputation`. Verified by test, not guessed — see squad.test.ts.
 */
export const MEAN_MATURITY = 0.95;

/**
 * How much each position leans on each attribute.
 *
 * With six universal attributes there is no dedicated goalkeeping stat, so
 * `defending` stands in for shot-stopping: a keeper is a defensive specialist
 * who cannot finish. Revisit if goalkeepers ever become playable in depth.
 */
export const POSITION_PROFILES: Readonly<
  Record<Position, Readonly<Record<AttributeKey, number>>>
> = {
  GK: { finishing: 0.35, passing: 0.75, dribbling: 0.5, pace: 0.7, defending: 1.1, physical: 1.0 },
  DF: { finishing: 0.55, passing: 0.85, dribbling: 0.7, pace: 0.95, defending: 1.2, physical: 1.15 },
  MF: { finishing: 0.85, passing: 1.2, dribbling: 1.05, pace: 0.95, defending: 0.9, physical: 0.95 },
  FW: { finishing: 1.25, passing: 0.9, dribbling: 1.15, pace: 1.1, defending: 0.5, physical: 1.0 },
};

/**
 * Weight of each position when reducing a squad to a single strength number.
 * The eleven that play matter more than the bench, and midfield decides more
 * matches than the substitutes' bench does.
 */
export const STRENGTH_STARTER_COUNT = 11;
export const STRENGTH_BENCH_WEIGHT = 0.25;
