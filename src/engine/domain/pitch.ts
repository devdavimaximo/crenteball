/**
 * The pitch coordinate system.
 *
 * One frame of reference shared by the engine (where players are, where a
 * pass goes) and the renderer (where to draw them). Metres, not pixels — the
 * camera turns metres into pixels, never the other way round.
 *
 *   x : across the pitch, 0 at the centre, negative left, positive right.
 *   y : along the pitch, 0 at the goal the player is attacking, increasing
 *       away from it.
 *
 * The player always attacks towards y = 0, so "closer to goal" is always
 * "smaller y" — no mirroring, no home/away sign flips in the geometry.
 */

/** Regulation-ish pitch, in metres. */
export const PITCH_WIDTH = 68;
export const PITCH_LENGTH = 105;
export const HALF_WIDTH = PITCH_WIDTH / 2;

/** Penalty area, measured from the goal line. */
export const BOX_DEPTH = 16.5;
export const BOX_HALF_WIDTH = 20.16;
export const SIX_YARD_DEPTH = 5.5;
export const PENALTY_SPOT_Y = 11;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Straight-line distance between two points, in metres. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Distance from a point to the centre of the attacking goal (0, 0). */
export function distanceToGoal(p: Point): number {
  return Math.hypot(p.x, p.y);
}

/**
 * Angle of a point off the straight line to goal, in degrees.
 * 0 is dead centre; positive is to the right. This is the `angle` the shot
 * model already speaks, so a ball position maps straight onto it.
 */
export function angleToGoal(p: Point): number {
  return (Math.atan2(p.x, Math.max(0.1, p.y)) * 180) / Math.PI;
}

/** True if the point sits inside the penalty area. */
export function isInsideBox(p: Point): boolean {
  return p.y <= BOX_DEPTH && Math.abs(p.x) <= BOX_HALF_WIDTH;
}

/** Clamps a point to the playable field, so nothing is generated in the stands. */
export function clampToPitch(p: Point): Point {
  return {
    x: Math.min(HALF_WIDTH, Math.max(-HALF_WIDTH, p.x)),
    y: Math.min(PITCH_LENGTH, Math.max(0, p.y)),
  };
}

/** Unit vector from `from` towards `to`. Zero-length falls back to "towards goal". */
export function directionTo(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return { x: 0, y: -1 };
  return { x: dx / length, y: dy / length };
}

/**
 * How far a point lies from the segment a→b — used to tell whether a defender
 * stands in a passing lane. Returns the perpendicular distance in metres.
 */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq < 1e-6) return distance(p, a);

  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq));
  return distance(p, { x: a.x + abx * t, y: a.y + aby * t });
}
