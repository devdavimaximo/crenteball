/**
 * Reading the slingshot gesture.
 *
 * You pull back from the ball and let go; the ball launches the *opposite*
 * way, harder the further you pulled — a catapult, the New Star Soccer feel.
 * A live arrow shows where it will go while you drag.
 *
 * Pure: screen points and a camera in, a pitch-space aim out. Turning the pull
 * into a launch direction is the part that decides whether the control feels
 * right, so it is the part that must be testable without a device.
 */
import type { Point } from '@/engine/domain/pitch';
import type { TopDownCamera } from '@/render/topdown';

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface SlingConfig {
  /** Shorter pulls than this are a cancel, not a weak shot. */
  readonly minDragPx: number;
  /** Pull length that maps to full power. */
  readonly maxDragPx: number;
  /** Any committed pull launches at least this hard. */
  readonly minPower: number;
}

export interface SlingReading {
  /** Unit launch direction, in pitch space. */
  readonly dir: Point;
  /** 0..1 power. */
  readonly power: number;
  /** Pull length in pixels — for the UI to show tension building. */
  readonly dragPx: number;
}

export function defaultSlingConfig(viewportHeight: number): SlingConfig {
  return {
    minDragPx: viewportHeight * 0.04,
    maxDragPx: viewportHeight * 0.32,
    minPower: 0.12,
  };
}

/**
 * The launch direction and power for a pull from `start` to `current`.
 *
 * The pull is measured in screen pixels for a consistent feel at any zoom,
 * then turned into a pitch direction — undoing the camera's depth compression,
 * so a straight-up pull launches straight up the pitch — and negated, because
 * the ball goes away from the pull.
 */
function launch(
  start: ScreenPoint,
  current: ScreenPoint,
  cam: TopDownCamera,
): { dir: Point; dragPx: number } {
  const dxPx = current.x - start.x;
  const dyPx = current.y - start.y;
  const dragPx = Math.hypot(dxPx, dyPx);

  // Screen drag -> pitch drag (depth axis is squashed) -> negate for the pull.
  const pitchDx = -dxPx / cam.scale;
  const pitchDy = -dyPx / (cam.scale * cam.depthScale);
  const len = Math.hypot(pitchDx, pitchDy) || 1;

  return { dir: { x: pitchDx / len, y: pitchDy / len }, dragPx };
}

/**
 * A finished pull. Null if it was too short to be a shot — a tap or a twitch
 * must never launch the ball.
 */
export function readSling(
  start: ScreenPoint,
  current: ScreenPoint,
  cam: TopDownCamera,
  config: SlingConfig,
): SlingReading | null {
  const { dir, dragPx } = launch(start, current, cam);
  if (dragPx < config.minDragPx) return null;

  return { dir, power: powerFor(dragPx, config), dragPx };
}

/**
 * The live reading while the finger is still down — never null, because there
 * is always an arrow to draw mid-pull.
 */
export function previewSling(
  start: ScreenPoint,
  current: ScreenPoint,
  cam: TopDownCamera,
  config: SlingConfig,
): SlingReading {
  const { dir, dragPx } = launch(start, current, cam);
  return { dir, power: powerFor(dragPx, config), dragPx };
}

function powerFor(dragPx: number, config: SlingConfig): number {
  return Math.min(1, Math.max(config.minPower, dragPx / config.maxDragPx));
}
