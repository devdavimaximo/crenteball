/**
 * The 2.5-D top-down camera.
 *
 * Looks down at the pitch from above, tilted forward a little so bodies have
 * height and the goal has depth — the modern mobile-football look, not the
 * flat overhead of the original. Pure orthographic maths: the depth axis is
 * compressed by the tilt and heights are lifted by it, which keeps verticals
 * vertical and every function here trivially invertible.
 *
 * World is metres in pitch coordinates (see engine/domain/pitch): x across,
 * y along towards the goal at y = 0. On screen the goal sits up top and the
 * ball is followed near the bottom, so the player is always shooting "up".
 */
import type { Point } from '@/engine/domain/pitch';

/** Tilt from straight-down, in radians. ~35° gives depth without distortion. */
export const TILT = (35 * Math.PI) / 180;

/** Pixels per metre at the reference zoom. Tuned for a phone; previews check it. */
export const BASE_SCALE = 15;

/** Where the followed ball sits vertically, as a fraction of the viewport. */
export const BALL_ANCHOR = 0.66;

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export interface TopDownCamera {
  /** World point the camera is centred on — it follows the ball. */
  readonly centerX: number;
  readonly centerY: number;
  readonly scale: number;
  readonly viewport: Viewport;
  /** cos(tilt): how much the depth axis is squashed. */
  readonly depthScale: number;
  /** sin(tilt): how much a metre of height lifts on screen. */
  readonly heightScale: number;
  /** Screen y that the camera centre maps to. */
  readonly anchorY: number;
}

export interface Projected {
  readonly sx: number;
  readonly sy: number;
}

/**
 * Builds a camera that follows a world point (the ball), keeping it near the
 * bottom of the frame so most of the screen shows the pitch ahead.
 */
export function topDownCamera(
  follow: Point,
  viewport: Viewport,
  scale = BASE_SCALE,
): TopDownCamera {
  return {
    centerX: follow.x,
    centerY: follow.y,
    scale,
    viewport,
    depthScale: Math.cos(TILT),
    heightScale: Math.sin(TILT),
    anchorY: viewport.height * BALL_ANCHOR,
  };
}

/**
 * Projects a world point at height `h` metres above the ground.
 *
 * Smaller y (nearer the goal) is higher on screen; height lifts the point up.
 * A body is drawn from its ground projection (h = 0) upward.
 */
export function project(x: number, y: number, h: number, cam: TopDownCamera): Projected {
  return {
    sx: cam.viewport.width / 2 + (x - cam.centerX) * cam.scale,
    sy:
      cam.anchorY +
      (y - cam.centerY) * cam.scale * cam.depthScale -
      h * cam.scale * cam.heightScale,
  };
}

/** Ground projection — the shorthand for the many things that sit on the grass. */
export function projectGround(p: Point, cam: TopDownCamera): Projected {
  return project(p.x, p.y, 0, cam);
}

/**
 * The inverse: which ground point sits under a screen pixel.
 *
 * This is how a finger on the pitch becomes an aim. Height is not recoverable
 * from a single pixel, so this always returns the ground point (h = 0), which
 * is what the control wants — you aim at a spot on the grass.
 */
export function unprojectGround(sx: number, sy: number, cam: TopDownCamera): Point {
  return {
    x: cam.centerX + (sx - cam.viewport.width / 2) / cam.scale,
    y: cam.centerY + (sy - cam.anchorY) / (cam.scale * cam.depthScale),
  };
}

/** How tall, in screen pixels, a thing of `metres` height stands at this zoom. */
export function heightPx(metres: number, cam: TopDownCamera): number {
  return metres * cam.scale * cam.heightScale;
}
