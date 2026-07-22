/**
 * Tuning for resolving a shot.
 *
 * The single most important balance file in the game: it decides whether the
 * minigame feels fair. A shot that goes in too often is boring; one that
 * misses despite a good aim feels rigged. The player must be able to look at
 * a miss and know *why*.
 */

/** Regulation goal, in metres. The frame everything is measured against. */
export const GOAL_WIDTH = 7.32;
export const GOAL_HEIGHT = 2.44;
export const GOAL_HALF_WIDTH = GOAL_WIDTH / 2;

/** Hitting the frame rather than missing entirely, in metres beyond the post. */
export const POST_MARGIN = 0.35;

/**
 * Baseline aiming error, in metres, for an average finisher taking an
 * unpressured shot from the penalty spot. Everything else scales this.
 *
 * Started at 0.55, which compounded to a 1.26m spread on an ordinary shot —
 * a sixth of the goal's width, wide enough that aiming for a corner scored
 * *less* often than blasting down the middle. That makes the aim a decoration
 * and the optimal play a single boring input. 0.35 keeps a miss possible
 * while letting a good aim be worth taking.
 */
export const BASE_ERROR = 0.35;

/** Finishing is measured against this: 50 is an average professional. */
export const FINISHING_REFERENCE = 50;

/**
 * How strongly finishing tightens the aim. At 1, doubling finishing halves
 * the error — steep enough that attribute growth is felt in the minigame,
 * which is what makes training worth doing.
 */
export const FINISHING_ACCURACY_POWER = 1;

/** Error grows with range. Metres of distance that add one unit of error. */
export const DISTANCE_ERROR_SCALE = 18;

/** A tight angle is harder. Full effect at the widest allowed angle. */
export const ANGLE_ERROR_AT_MAX = 0.55;
export const MAX_SHOT_ANGLE = 45;

/**
 * Blasting it costs accuracy. Error multiplier added at full power.
 *
 * Raised from 0.7 once keepers were made harder to beat: with saves the main
 * way a shot dies, a 30% save reduction outweighed a 0.7x accuracy cost at
 * every range, and maximum power became the answer to every situation. Power
 * has to hurt enough that placing it is right from close in.
 */
export const POWER_ERROR_AT_MAX = 1.1;

/** Every defender in the way adds error and a chance of a block. */
export const DEFENDER_ERROR = 0.18;
export const BLOCK_CHANCE_PER_DEFENDER = 0.11;
/** Curling the ball is what beats a wall — at the cost of precision. */
export const CURVE_BLOCK_REDUCTION = 0.55;
export const CURVE_ERROR_AT_MAX = 0.4;
/** Curve only bends properly with technique behind it. */
export const CURVE_DRIBBLING_REFERENCE = 50;

/**
 * Pressure — a late equaliser, a penalty, a cup final.
 *
 * `MAX_PRESSURE_ERROR` is how much worse a player with no composure at all
 * shoots under maximum pressure. Composure cancels it, and composure is fed
 * by devotion: this is the faith pillar's first mechanical effect, and the
 * reason it is a system rather than a theme.
 *
 * A devout player is not a better footballer. He is the same footballer when
 * it matters.
 */
export const MAX_PRESSURE_ERROR = 0.85;
export const COMPOSURE_REFERENCE = 100;

/**
 * Keeper reach. Base chance an on-target shot is saved by an average keeper.
 *
 * PROVISIONAL. At 0.62 an average finisher converted 57% of central chances
 * from 16 metres, which over a season would make any player the league's top
 * scorer twice over — the simulated golden boot averages 19 goals.
 *
 * The honest calibration cannot happen yet: it depends on how many shots a
 * match actually produces once the full match loop exists. Recheck this
 * against the 19-goal benchmark at the M3.7 prototype, with real playtesting
 * — the number that matters is goals per season, not conversion per shot.
 */
export const BASE_SAVE_CHANCE = 0.78;
export const KEEPER_REFERENCE = 50;
/** Power beats a keeper: reduction of save chance at full power. */
export const POWER_SAVE_REDUCTION = 0.3;
/**
 * Placement beats a keeper harder. A shot tucked into the corner is far
 * better than one straight down the middle, which is what rewards aiming
 * carefully rather than always blasting.
 */
export const PLACEMENT_SAVE_REDUCTION = 0.88;

/**
 * A keeper always has a chance, however hopeless. Football has no certainties,
 * and a shot that cannot be saved is a cutscene rather than a moment.
 */
export const MIN_SAVE_CHANCE = 0.05;

/**
 * A shot needs pace to survive the distance.
 *
 * Without this the power control is nearly inert: measured across 20,000
 * shots from 16 metres, tapping it in scored 58.4% and blasting it 55.8%, so
 * minimum power was quietly the right answer every time and one of the two
 * inputs did nothing.
 *
 * Requiring pace in proportion to range restores the trade: from close in you
 * can place it softly, from range you must hit it — and hitting it costs the
 * accuracy you need at that distance. That tension is the shot's decision.
 */
export const POWER_DISTANCE_REFERENCE = 35;
export const WEAK_SHOT_SAVE_PENALTY = 1.6;

/** Very close range gives the keeper less time. */
export const CLOSE_RANGE_METRES = 8;
export const CLOSE_RANGE_SAVE_BONUS = 0.12;

/** Expected-goals heuristic, for statistics only — never for resolving a shot. */
export const XG_DISTANCE_SCALE = 11;
export const XG_MIN = 0.01;
export const XG_MAX = 0.95;
