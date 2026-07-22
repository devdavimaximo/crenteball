/**
 * The camera: world metres to screen pixels.
 *
 * A single fixed perspective, sat a few metres behind the ball and slightly
 * above it, looking at the goal — the New Star Soccer framing. Pure pinhole
 * maths with no rotation: lateral shot angles shift the goal sideways on
 * screen instead of rotating the view, which reads correctly and keeps every
 * function here trivially testable.
 *
 * World space: origin at the centre of the goal line, x to the shooter's
 * right, y up, depth measured from the camera towards the goal.
 */
import { GOAL_WIDTH } from '@/engine/balance/shot';

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export interface Camera {
  /** Metres the camera sits behind the ball. */
  readonly backOff: number;
  /** Camera height in metres. */
  readonly height: number;
  /** Lateral camera position — follows the shooter. */
  readonly x: number;
  /** Focal length in pixels. Derived from the viewport, not configured. */
  readonly focal: number;
  /** Screen y of the horizon line. */
  readonly horizonY: number;
  /**
   * Radians the camera is turned towards the goal. Zero looks straight down
   * the pitch. A yaw keeps verticals vertical, so the goal frame and every
   * body stay upright.
   */
  readonly yaw: number;
}

/** A projected point plus the scale objects at that depth should be drawn at. */
export interface Projected {
  readonly sx: number;
  readonly sy: number;
  readonly scale: number;
}

/** Ball position in world space for a moment's distance and angle. */
export function ballWorldX(distance: number, angleDeg: number): number {
  return Math.sin((angleDeg * Math.PI) / 180) * distance;
}

/**
 * Builds the camera for a scene.
 *
 * The focal length is fitted so the goal stays comfortably in frame across
 * the whole distance range (a 3m header to a 45m through-ball) on any
 * viewport — the one bit of tuning in this file, chosen over exposing a
 * configurable FOV nobody would know how to set.
 */
/** Goal width as a fraction of the viewport, at the near and far extremes. */
const GOAL_FRACTION_NEAR = 0.66;
const GOAL_FRACTION_FAR = 0.3;
const NEAR_DISTANCE = 5;
const FAR_DISTANCE = 45;

/** Camera height, and where the horizon and the ball should sit on screen. */
const CAMERA_HEIGHT = 2.5;
const HORIZON_FRACTION = 0.3;
const BALL_SCREEN_FRACTION = 0.79;

/**
 * How much of the frame's *half* width the goal may reach, offset included.
 *
 * Must stay below 0.5 or the far post leaves the frame — 0.54 looked like a
 * generous bigger-goal tweak and clipped every angled shot.
 */
const GOAL_SAFE_FRACTION = 0.45;

/** How far behind the ball the camera may sit. */
const MIN_BACK_OFF = 1.2;
const MAX_BACK_OFF = 9;

/** Share of the way towards the goal the camera turns. */
const YAW_FOLLOW = 0.5;

/** How far off-centre the ball may sit, as a fraction of the half width. */
const BALL_SAFE_FRACTION = 0.33;

/**
 * Builds the camera for a scene.
 *
 * Both the lens and the camera's distance behind the ball are *solved from
 * the composition* rather than tuned:
 *
 *   1. the goal must fit fully in frame, however wide the angle;
 *   2. the ball must sit near the bottom of the screen at every range.
 *
 * Tuning a focal length by hand is how the first pass produced a goal
 * clipped off the left edge with the bottom half of the screen empty. An
 * angled shot now naturally shows a smaller goal further to one side, which
 * is both what a camera would see and a fair signal of difficulty.
 */
export function cameraFor(distance: number, angleDeg: number, viewport: Viewport): Camera {
  const ballX = ballWorldX(distance, angleDeg);
  const horizonY = viewport.height * HORIZON_FRACTION;

  // Vertical budget: how far below the horizon the ball is allowed to land.
  const verticalBudget = Math.max(1, viewport.height * BALL_SCREEN_FRACTION - horizonY);

  // Turning the camera fully onto the goal only swaps who sits off-centre —
  // the goal centres and the ball swings out by the same amount. Turning half
  // way splits the offset between them, so both stay near the middle and the
  // lens no longer has to shrink to a fisheye for a wide chance.
  const roughDepth = distance + 3;
  const yaw = Math.atan2(ballX, roughDepth) * YAW_FOLLOW;

  // What is left off-centre after the turn, measured in goal widths.
  const goalOffset = (Math.abs(ballX) * (1 - YAW_FOLLOW)) / GOAL_WIDTH;
  const ballOffset = (Math.abs(ballX) * YAW_FOLLOW) / GOAL_WIDTH;

  const fitFraction = GOAL_SAFE_FRACTION / (goalOffset + 0.5);
  // The ball has to stay on screen too, and it is what the player aims from.
  const ballFitFraction = ballOffset > 0 ? BALL_SAFE_FRACTION / ballOffset : Infinity;

  const t = Math.min(1, Math.max(0, (distance - NEAR_DISTANCE) / (FAR_DISTANCE - NEAR_DISTANCE)));
  const rangeFraction =
    GOAL_FRACTION_NEAR + (GOAL_FRACTION_FAR - GOAL_FRACTION_NEAR) * t ** 0.62;

  const goalFraction = Math.min(rangeFraction, fitFraction, ballFitFraction);

  // The lens the goal framing asks for can be longer than the vertical budget
  // allows: on a wide screen, a goal filling half the *width* needs a lens
  // that pushes the ball off the bottom of a much shorter frame. Capping by
  // both axes means a landscape viewport simply shows a smaller goal.
  const maxFocal = (verticalBudget * MAX_BACK_OFF) / CAMERA_HEIGHT;

  // focal and backOff depend on each other; two passes converge to within a
  // few centimetres, which is far below anything visible.
  let backOff = 3;
  let focal = 0;
  for (let pass = 0; pass < 3; pass += 1) {
    focal = Math.min(
      maxFocal,
      (viewport.width * goalFraction * (distance + backOff)) / GOAL_WIDTH,
    );
    backOff = Math.min(MAX_BACK_OFF, Math.max(MIN_BACK_OFF, (focal * CAMERA_HEIGHT) / verticalBudget));
  }

  return {
    backOff,
    // Slightly raised: looking a little down opens the goal mouth and shows
    // the pitch, instead of a flat eye-level band of grass.
    height: CAMERA_HEIGHT,
    // The camera sits at the ball's line and turns; moving it sideways
    // instead is amplified by how close the ball is and throws it out of
    // frame entirely.
    x: ballX,
    focal,
    horizonY,
    yaw,
  };
}

/**
 * Projects a world point.
 *
 * `depth` is metres from the camera along the view axis; points behind the
 * camera are clamped to a minimum depth rather than exploding to infinity.
 */
export function project(
  x: number,
  y: number,
  depth: number,
  camera: Camera,
  viewport: Viewport,
): Projected {
  const lateral = x - camera.x;

  // Rotate the point into camera space. `depth` stays a world measurement —
  // metres down the pitch — so callers never have to think about the yaw.
  const cos = Math.cos(camera.yaw);
  const sin = Math.sin(camera.yaw);
  const alongView = Math.max(0.5, -lateral * sin + depth * cos);
  const acrossView = lateral * cos + depth * sin;

  const scale = camera.focal / alongView;

  return {
    sx: viewport.width / 2 + acrossView * scale,
    sy: camera.horizonY + (camera.height - y) * scale,
    scale,
  };
}

/** Depth from the camera for a point at `metresFromGoal` along the pitch. */
export function depthOf(metresFromGoal: number, distance: number, camera: Camera): number {
  return camera.backOff + distance - metresFromGoal;
}

/**
 * The inverse of `project` for a known depth: which world point at that depth
 * sits under this pixel. This is how a finger on the screen becomes an aim on
 * the goal plane — the touch controls depend on it being an exact inverse,
 * which the round-trip test guarantees.
 */
export function unprojectAtDepth(
  sx: number,
  sy: number,
  depth: number,
  camera: Camera,
  viewport: Viewport,
): { x: number; y: number } {
  const d = Math.max(0.5, depth);
  const cos = Math.cos(camera.yaw);
  const sin = Math.sin(camera.yaw);

  // With a yaw, the goal plane is no longer perpendicular to the view axis,
  // so this solves where the pixel's ray crosses the plane at world `depth`
  // rather than simply dividing by a scale.
  const k = (sx - viewport.width / 2) / camera.focal;
  const denominator = cos + k * sin;
  const lateral =
    Math.abs(denominator) < 1e-6 ? 0 : (d * (k * cos - sin)) / denominator;

  const alongView = Math.max(0.5, -lateral * sin + d * cos);

  return {
    x: camera.x + lateral,
    y: camera.height - ((sy - camera.horizonY) * alongView) / camera.focal,
  };
}
