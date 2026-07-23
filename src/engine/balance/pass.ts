/**
 * Tuning for passes and crosses.
 *
 * A pass is the other half of having the ball, and the reason the top-down
 * view exists: the player looks up, sees a teammate, and decides to find him
 * instead of shooting. So completing a pass has to feel earned — a defender in
 * the lane is a real risk — without being so fickle that passing is a tax.
 */

/** Completion for an average passer, unopposed, over a short distance. */
export const BASE_COMPLETION = 0.94;

/** Passing is measured against this: 50 is an average professional. */
export const PASSING_REFERENCE = 50;

/** How much passing ability swings completion around the base, either way. */
export const PASSING_SWING = 0.2;

/** Completion lost per metre of pass. Long balls are the hard ones. */
export const DISTANCE_PENALTY_PER_M = 0.004;

/** The power a pass "wants" grows with range: short balls float in, long balls are driven. */
export const IDEAL_POWER_BASE = 0.35;
export const IDEAL_POWER_RANGE = 90;
export const POWER_MISS_PENALTY = 0.5;

/**
 * A defender in the lane is the main way a pass dies.
 *
 * Interception chance falls off with how far the defender stands from the
 * straight line between passer and target; `INTERCEPT_REACH` is the distance
 * at which he is no longer a factor.
 */
export const INTERCEPT_REACH = 4.5;
export const MAX_INTERCEPT_CHANCE = 0.6;

/** A cross is a longer ball into a crowd: harder to complete than a pass. */
export const CROSS_COMPLETION_PENALTY = 0.22;

/**
 * A completed cross or a pass into a dangerous position doesn't just arrive —
 * the teammate attacks it. This is the chance it becomes a goal outright,
 * scaled by how good the receiving position was.
 */
export const ASSIST_CONVERSION_BASE = 0.45;

/** Pressure, answered by composure, as everywhere the faith pillar reaches. */
export const MAX_PRESSURE_PENALTY = 0.3;
export const COMPOSURE_REFERENCE = 100;

/** How close the aim must land to a teammate to count as aimed at him, metres. */
export const PASS_TARGET_TOLERANCE = 6;

/**
 * How a shot is told from a pass: the aim ray must cross the goal line within
 * a post's width of the frame, from inside shooting range. Pointing merely
 * "towards goal" is not enough — a wide ball to a teammate does that too.
 */
export const SHOT_MOUTH_TOLERANCE = 2.5;
export const SHOT_MAX_DISTANCE = 34;
