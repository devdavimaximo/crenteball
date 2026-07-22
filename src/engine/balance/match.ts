/**
 * Tuning for simulated matches between AI clubs.
 *
 * These decide whether the league table at the end of a season looks like
 * football or like noise. `sim:seasons` is what checks them: goals per match,
 * home win rate and the spread between champion and last place.
 */

/**
 * Goals a perfectly average side is expected to score against another.
 *
 * Measured over 11,400 simulated fixtures: 1.35 produced 2.96 goals per match
 * against a real-world 2.6-2.8, and pushed 3.4% of matches past seven goals.
 * 1.25 lands near 2.7.
 */
export const BASE_EXPECTED_GOALS = 1.25;

/**
 * How many points of squad strength it takes to multiply expected goals by e.
 *
 * Larger means a flatter, more competitive league.
 *
 * Started at 30, which turned out to model a sport football is not: the
 * strongest club was expected to score 3.85 against the weakest while
 * conceding 0.51, upsets happened under 2% of the time, and one match in 430
 * finished with ten or more goals. At 45 the same fixture is roughly 2.8 v
 * 0.7 — still a heavy favourite, but a league where the bottom club can win
 * at the top club a few times a season, which is what makes a table worth
 * reading.
 */
export const STRENGTH_SCALE = 45;

/**
 * Playing at home. Applied as a small boost to the hosts' expected goals and
 * a matching dampening of the visitors'.
 */
export const HOME_ATTACK_MULTIPLIER = 1.16;
export const AWAY_ATTACK_MULTIPLIER = 0.92;

/**
 * Bounds on expected goals, so an extreme mismatch cannot produce a 12-0.
 * Football's scorelines are compressed by the clock, not just by quality.
 */
export const MIN_EXPECTED_GOALS = 0.15;
export const MAX_EXPECTED_GOALS = 4.2;

/**
 * Relative likelihood of scoring, by position, before finishing ability is
 * taken into account. Keepers are excluded entirely: a goalkeeper goal is a
 * once-a-decade event, not a simulation feature.
 */
export const SCORING_WEIGHT_BY_POSITION = {
  GK: 0,
  DF: 0.12,
  MF: 0.33,
  FW: 1,
} as const;

/** Finishing is divided by this before weighting, so it scales rather than dominates. */
export const FINISHING_REFERENCE = 50;

/**
 * How sharply finishing concentrates goals on the best strikers.
 *
 * Linear (1) spread goals too evenly: the league's top scorer averaged 16.8
 * over 20 simulated seasons, against a real 20-25 in a 38-round division. A
 * squared weight reflects that the best finisher is not merely slightly more
 * likely to score — he is the one the team plays through, and he takes the
 * penalties.
 */
export const FINISHING_EXPONENT = 2;

export const MATCH_MINUTES = 90;
