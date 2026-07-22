/**
 * Reading the shot gesture.
 *
 * The control is a swipe through the ball towards the goal: where the finger
 * ends is the aim, how fast it travelled is the power. One continuous
 * gesture, two decoupled inputs — a slow deliberate swipe places the ball, a
 * sharp flick blasts it, and either can go to either corner.
 *
 * Pure data-in data-out: pointer events are collected by the screen and
 * handed here as samples. No DOM, no timers — the mapping from movement to
 * intent is the part of a touch control that must be testable, because it is
 * the part that decides whether the game feels right.
 */

export interface SwipeSample {
  readonly x: number;
  readonly y: number;
  /** Milliseconds, from any monotonic clock. */
  readonly t: number;
}

export interface SwipeConfig {
  /** Swipes shorter than this are a cancelled shot, not a weak one. */
  readonly minLengthPx: number;
  /** Swipe speed that maps to full power. */
  readonly maxSpeedPxPerMs: number;
  /**
   * The floor: any committed swipe strikes the ball at least this hard.
   * Without it, a slow swipe produces a comedy backpass nobody intended.
   */
  readonly minPower: number;
}

export interface SwipeReading {
  /** Screen point where the swipe ended — the aim, before unprojection. */
  readonly endX: number;
  readonly endY: number;
  /** 0..1 shot power. */
  readonly power: number;
}

/** Sensible defaults, scaled by viewport height where it matters. */
export function defaultSwipeConfig(viewportHeight: number): SwipeConfig {
  return {
    minLengthPx: viewportHeight * 0.06,
    maxSpeedPxPerMs: viewportHeight * 0.0045,
    minPower: 0.15,
  };
}

function pathLength(samples: readonly SwipeSample[]): number {
  let total = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1] as SwipeSample;
    const b = samples[i] as SwipeSample;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/**
 * Interprets a finished swipe. Returns null for a gesture too short to be a
 * shot — a tap or a hesitation must never launch the ball.
 */
export function readSwipe(
  samples: readonly SwipeSample[],
  config: SwipeConfig,
): SwipeReading | null {
  if (samples.length < 2) return null;

  const first = samples[0] as SwipeSample;
  const last = samples[samples.length - 1] as SwipeSample;

  const length = pathLength(samples);
  if (length < config.minLengthPx) return null;

  // Speed over the whole gesture, not the last two samples: pointer events
  // arrive in bursts, and instantaneous speed between two adjacent samples is
  // noise that would make the same physical flick vary wildly in power.
  const duration = Math.max(1, last.t - first.t);
  const speed = length / duration;

  const power = Math.min(1, Math.max(config.minPower, speed / config.maxSpeedPxPerMs));

  return { endX: last.x, endY: last.y, power };
}

/**
 * Live progress of an unfinished swipe, for the reticle while the finger is
 * still down. Same rules, but never null — mid-gesture there is always
 * something to draw.
 */
export function previewSwipe(
  samples: readonly SwipeSample[],
  config: SwipeConfig,
): SwipeReading {
  const reading = readSwipe(samples, config);
  if (reading) return reading;

  const last = samples[samples.length - 1] ?? { x: 0, y: 0, t: 0 };
  return { endX: last.x, endY: last.y, power: config.minPower };
}
