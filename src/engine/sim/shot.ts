/**
 * Resolving a shot.
 *
 * The player aims and picks a power; the engine decides where the ball
 * actually went and what happened to it. Nothing here reads input devices or
 * draws anything — it takes numbers and returns numbers, which is what lets
 * the whole minigame be balanced without opening a browser.
 *
 * The model, in order:
 *   1. the aim is turned into a point on the goal plane
 *   2. that point is displaced by an error drawn from the player's accuracy
 *   3. a defender may block it on the way
 *   4. if it is off the frame, it misses (or hits the post)
 *   5. otherwise the keeper gets a chance, weighted by placement and power
 */
import {
  ANGLE_ERROR_AT_MAX,
  BASE_ERROR,
  BASE_SAVE_CHANCE,
  BLOCK_CHANCE_PER_DEFENDER,
  CLOSE_RANGE_METRES,
  CLOSE_RANGE_SAVE_BONUS,
  COMPOSURE_REFERENCE,
  CURVE_BLOCK_REDUCTION,
  CURVE_DRIBBLING_REFERENCE,
  CURVE_ERROR_AT_MAX,
  DEFENDER_ERROR,
  DISTANCE_ERROR_SCALE,
  FINISHING_ACCURACY_POWER,
  FINISHING_REFERENCE,
  GOAL_HALF_WIDTH,
  GOAL_HEIGHT,
  KEEPER_REFERENCE,
  MAX_PRESSURE_ERROR,
  MAX_SHOT_ANGLE,
  MIN_SAVE_CHANCE,
  PLACEMENT_SAVE_REDUCTION,
  POST_MARGIN,
  POWER_DISTANCE_REFERENCE,
  POWER_ERROR_AT_MAX,
  POWER_SAVE_REDUCTION,
  WEAK_SHOT_SAVE_PENALTY,
  XG_DISTANCE_SCALE,
  XG_MAX,
  XG_MIN,
} from '@/engine/balance/shot';
import type { Rng } from '@/engine/rng';

/** What the player did. All values normalised, so the UI never sends metres. */
export interface ShotInput {
  /** -1 is the left post, 0 the centre, 1 the right post. */
  readonly aimX: number;
  /** 0 is along the ground, 1 is the crossbar. */
  readonly aimY: number;
  /** 0..1. More power beats the keeper and costs accuracy. */
  readonly power: number;
  /** -1..1. Bends the ball around a wall, at the cost of precision. */
  readonly curve: number;
}

/** Everything about the situation and the player taking the shot. */
export interface ShotContext {
  readonly distance: number;
  readonly angle: number;
  readonly defenders: number;
  readonly finishing: number;
  readonly dribbling: number;
  /**
   * 0..100. How little the occasion gets to the player. Fed by devotion —
   * see engine/balance/shot.ts.
   */
  readonly composure: number;
  /** 0..1. How big the moment is. */
  readonly pressure: number;
  readonly keeperRating: number;
}

export type ShotOutcome = 'goal' | 'saved' | 'post' | 'off-target' | 'blocked';

export interface ShotResult {
  readonly outcome: ShotOutcome;
  /** Where the ball actually crossed the goal line, in metres from centre. */
  readonly targetX: number;
  /** Height in metres. */
  readonly targetY: number;
  /** How good the chance was, before the player took it. Statistics only. */
  readonly xG: number;
}

/**
 * How far the ball is expected to stray, in metres.
 *
 * Exported because the UI shows it: the aiming reticle grows and shrinks with
 * this number, so a hard chance *looks* hard before the player commits.
 * Guessing at difficulty is not a mechanic, it is a missing UI.
 */
export function aimingError(input: ShotInput, context: ShotContext): number {
  const skill = (context.finishing || 1) / FINISHING_REFERENCE;
  const skillFactor = 1 / skill ** FINISHING_ACCURACY_POWER;

  const distanceFactor = 1 + context.distance / DISTANCE_ERROR_SCALE;
  const angleFactor = 1 + (Math.abs(context.angle) / MAX_SHOT_ANGLE) * ANGLE_ERROR_AT_MAX;
  const powerFactor = 1 + input.power * POWER_ERROR_AT_MAX;
  const defenderFactor = 1 + context.defenders * DEFENDER_ERROR;

  // Curve is only as controlled as the technique behind it.
  const curveControl = (context.dribbling || 1) / CURVE_DRIBBLING_REFERENCE;
  const curveFactor = 1 + (Math.abs(input.curve) * CURVE_ERROR_AT_MAX) / Math.max(0.4, curveControl);

  // Composure cancels pressure. At 100 composure the occasion costs nothing.
  const exposure = 1 - Math.min(1, context.composure / COMPOSURE_REFERENCE);
  const pressureFactor = 1 + context.pressure * exposure * MAX_PRESSURE_ERROR;

  return (
    BASE_ERROR *
    skillFactor *
    distanceFactor *
    angleFactor *
    powerFactor *
    defenderFactor *
    curveFactor *
    pressureFactor
  );
}

/**
 * A rough quality-of-chance number, in the spirit of expected goals.
 *
 * Used for statistics and post-match feedback ("you missed a big chance"),
 * never to decide an outcome — the outcome comes from what the player did.
 */
export function chanceQuality(context: ShotContext): number {
  const distanceFactor = Math.exp(-context.distance / XG_DISTANCE_SCALE);
  const angleFactor = Math.cos((Math.abs(context.angle) * Math.PI) / 180);
  const defenderFactor = 1 / (1 + context.defenders * 0.45);

  return Math.min(XG_MAX, Math.max(XG_MIN, distanceFactor * angleFactor * defenderFactor));
}

function isBlocked(input: ShotInput, context: ShotContext, rng: Rng): boolean {
  if (context.defenders === 0) return false;

  const curveRelief = 1 - Math.abs(input.curve) * CURVE_BLOCK_REDUCTION;
  const chance = context.defenders * BLOCK_CHANCE_PER_DEFENDER * curveRelief;

  return rng.chance(chance);
}

function isSaved(
  input: ShotInput,
  context: ShotContext,
  targetX: number,
  targetY: number,
  rng: Rng,
): boolean {
  const keeper = context.keeperRating / KEEPER_REFERENCE;

  // 0 down the middle at mid height, 1 tucked right into a top corner.
  const horizontal = Math.min(1, Math.abs(targetX) / GOAL_HALF_WIDTH);
  const vertical = Math.min(1, Math.abs(targetY - GOAL_HEIGHT / 2) / (GOAL_HEIGHT / 2));
  const placement = Math.min(1, Math.hypot(horizontal, vertical) / Math.SQRT2);

  let chance = BASE_SAVE_CHANCE * keeper;
  chance *= 1 - placement * PLACEMENT_SAVE_REDUCTION;
  chance *= 1 - input.power * POWER_SAVE_REDUCTION;

  // A shot struck too softly for its range arrives comfortably.
  const requiredPower = Math.min(1, context.distance / POWER_DISTANCE_REFERENCE);
  const shortfall = Math.max(0, requiredPower - input.power);
  chance *= 1 + shortfall * WEAK_SHOT_SAVE_PENALTY;

  // Point-blank range leaves less time to react.
  if (context.distance < CLOSE_RANGE_METRES) chance -= CLOSE_RANGE_SAVE_BONUS;

  return rng.chance(Math.min(0.95, Math.max(MIN_SAVE_CHANCE, chance)));
}

export function resolveShot(input: ShotInput, context: ShotContext, rng: Rng): ShotResult {
  const intendedX = input.aimX * GOAL_HALF_WIDTH;
  const intendedY = input.aimY * GOAL_HEIGHT;

  const error = aimingError(input, context);
  const targetX = intendedX + rng.gaussian(0, error);
  const targetY = Math.max(0, intendedY + rng.gaussian(0, error * 0.6));

  const xG = chanceQuality(context);
  const base = { targetX, targetY, xG };

  if (isBlocked(input, context, rng)) {
    return { outcome: 'blocked', ...base };
  }

  const insideWidth = Math.abs(targetX) <= GOAL_HALF_WIDTH;
  const insideHeight = targetY <= GOAL_HEIGHT;

  if (!insideWidth || !insideHeight) {
    const grazesPost =
      Math.abs(targetX) <= GOAL_HALF_WIDTH + POST_MARGIN &&
      targetY <= GOAL_HEIGHT + POST_MARGIN;

    return { outcome: grazesPost ? 'post' : 'off-target', ...base };
  }

  if (isSaved(input, context, targetX, targetY, rng)) {
    return { outcome: 'saved', ...base };
  }

  return { outcome: 'goal', ...base };
}
