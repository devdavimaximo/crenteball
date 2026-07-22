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
export function cameraFor(distance: number, angleDeg: number, viewport: Viewport): Camera {
  const backOff = 5;
  const depthToGoal = distance + backOff;

  // Fit: partial compensation for distance. Fully proportional (exponent 1)
  // kept the goal the same pixel size at 8m and 30m, erasing the depth cue
  // that tells the player how far out they are; no compensation at all lets
  // a 45m goal shrink to a sliver. The 0.65 exponent keeps the goal framed
  // while a long shot still *looks* long.
  const focal = Math.min(
    viewport.width * 0.55 * (depthToGoal / 9) ** 0.65,
    viewport.width * 3.4,
  );

  return {
    backOff,
    height: 1.7,
    x: ballWorldX(distance, angleDeg),
    focal,
    horizonY: viewport.height * 0.34,
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
  const d = Math.max(0.5, depth);
  const scale = camera.focal / d;

  return {
    sx: viewport.width / 2 + (x - camera.x) * scale,
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
  const scale = camera.focal / d;

  return {
    x: camera.x + (sx - viewport.width / 2) / scale,
    y: camera.height - (sy - camera.horizonY) / scale,
  };
}
