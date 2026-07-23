/**
 * Resolving a pass or a cross.
 *
 * A pass travels from the ball to a target; a defender in the lane can cut it
 * out, distance and pressure erode it, and a good ball into a dangerous
 * position can be turned in by the teammate who receives it.
 *
 * Pure and deterministic, like the shot model it sits beside.
 */
import {
  ASSIST_CONVERSION_BASE,
  BASE_COMPLETION,
  COMPOSURE_REFERENCE,
  CROSS_COMPLETION_PENALTY,
  DISTANCE_PENALTY_PER_M,
  IDEAL_POWER_BASE,
  IDEAL_POWER_RANGE,
  INTERCEPT_REACH,
  MAX_INTERCEPT_CHANCE,
  MAX_PRESSURE_PENALTY,
  PASSING_REFERENCE,
  PASSING_SWING,
  POWER_MISS_PENALTY,
} from '@/engine/balance/pass';
import type { Point } from '@/engine/domain/pitch';
import { distance, distanceToSegment, isInsideBox } from '@/engine/domain/pitch';
import type { Rng } from '@/engine/rng';

export type PassOutcome = 'complete' | 'intercepted' | 'overhit';

export interface PassContext {
  readonly from: Point;
  readonly to: Point;
  readonly defenders: readonly Point[];
  readonly passing: number;
  readonly composure: number;
  readonly pressure: number;
  /** 0..1. How hard the ball was played, relative to what the distance needs. */
  readonly power: number;
  /** A cross is judged more harshly than a ground pass. */
  readonly isCross: boolean;
}

export interface PassResult {
  readonly outcome: PassOutcome;
  /** Where the ball ended up. */
  readonly end: Point;
  /** Chance the receiving teammate turns a completed ball straight into a goal. */
  readonly assistChance: number;
}

/**
 * Completion probability, before the interception roll.
 *
 * Exported so the UI can hint at difficulty — a pass into a tight lane should
 * look risky before the player commits to it, the same way the shot reticle
 * grows with error.
 */
export function completionChance(context: PassContext): number {
  const skill = 1 + ((context.passing - PASSING_REFERENCE) / PASSING_REFERENCE) * PASSING_SWING;
  const length = distance(context.from, context.to);

  let chance = BASE_COMPLETION * skill;
  chance -= length * DISTANCE_PENALTY_PER_M;
  if (context.isCross) chance -= CROSS_COMPLETION_PENALTY;

  // The ball wants more power the further it travels; under- or over-hitting
  // it relative to that loosens the pass.
  const idealPower = Math.min(1, IDEAL_POWER_BASE + length / IDEAL_POWER_RANGE);
  chance -= Math.abs(context.power - idealPower) * POWER_MISS_PENALTY;

  const exposure = 1 - Math.min(1, context.composure / COMPOSURE_REFERENCE);
  chance -= context.pressure * exposure * MAX_PRESSURE_PENALTY;

  return Math.min(0.98, Math.max(0.05, chance));
}

/** The single most threatening defender in the passing lane, 0..1. */
function interceptThreat(context: PassContext): number {
  let worst = 0;
  for (const defender of context.defenders) {
    const off = distanceToSegment(defender, context.from, context.to);
    if (off >= INTERCEPT_REACH) continue;
    const threat = (1 - off / INTERCEPT_REACH) * MAX_INTERCEPT_CHANCE;
    worst = Math.max(worst, threat);
  }
  return worst;
}

export function resolvePass(context: PassContext, rng: Rng): PassResult {
  const intercept = interceptThreat(context);

  // A defender in the lane gets first refusal on the ball.
  if (rng.chance(intercept)) {
    return { outcome: 'intercepted', end: midpoint(context.from, context.to), assistChance: 0 };
  }

  if (!rng.chance(completionChance(context))) {
    // Ball played, but loose — overhit past the target.
    return { outcome: 'overhit', end: overrun(context.from, context.to), assistChance: 0 };
  }

  // Completed. A ball into the box, or a cross, gives the receiver a chance.
  const dangerous = isInsideBox(context.to) || context.isCross;
  const assistChance = dangerous
    ? ASSIST_CONVERSION_BASE * (context.isCross ? 0.8 : 1) * (isInsideBox(context.to) ? 1 : 0.6)
    : 0;

  return { outcome: 'complete', end: context.to, assistChance };
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** A little past the target, where an overhit ball runs to. */
function overrun(a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return { x: b.x + dx * 0.18, y: Math.max(0, b.y + dy * 0.18) };
}
