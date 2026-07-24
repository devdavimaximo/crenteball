/**
 * The ball's flight after an action, as a function of time.
 *
 * Pure sampling: `(spec, elapsedMs) -> frame`. No timers, no state — the play
 * screen's requestAnimationFrame loop asks for frames and draws them, so the
 * animation is deterministic and a dropped frame only skips, never desyncs.
 *
 * The spec says only where the ball starts and ends, how high it arcs and what
 * happened; turning a resolved action into that spec is the caller's job, which
 * keeps this module free of game rules.
 */
import type { Point } from '@/engine/domain/pitch';
import { distance } from '@/engine/domain/pitch';

export type FlightOutcome =
  | 'goal'
  | 'saved'
  | 'post'
  | 'off'
  | 'blocked'
  | 'complete'
  | 'intercepted'
  | 'overhit';

export interface ActionAnimationSpec {
  readonly from: Point;
  readonly to: Point;
  /** Arc apex in metres. 0 for a ball played along the ground. */
  readonly peakHeight: number;
  readonly outcome: FlightOutcome;
  readonly goal: boolean;
  /** 0..1 — a harder strike flies faster and kicks up more turf. */
  readonly power: number;
}

export interface BallPoint {
  readonly x: number;
  readonly y: number;
  readonly h: number;
}

export interface TurfSpeck {
  readonly x: number;
  readonly y: number;
  readonly alpha: number;
}

export interface TopDownFrame {
  readonly ball: BallPoint;
  readonly trail: readonly BallPoint[];
  readonly done: boolean;
  /** Where and how hard the ball hit the net, for the bulge. Null unless a goal. */
  readonly netImpact: { readonly at: Point; readonly strength: number } | null;
  readonly turf: readonly TurfSpeck[];
  /** Camera kick in metres, oscillating and decaying after impact. */
  readonly shakeX: number;
  readonly shakeY: number;
  readonly flash: number;
}

const MIN_SPEED = 16;
const MAX_SPEED = 40;

/** How long the outcome lingers after the ball arrives, in ms. */
const AFTERMATH_MS: Record<FlightOutcome, number> = {
  goal: 650,
  saved: 450,
  post: 500,
  off: 380,
  blocked: 380,
  complete: 350,
  intercepted: 350,
  overhit: 350,
};

const TRAIL_SAMPLES = 7;
const TRAIL_STEP_MS = 9;
const TURF_SPECKS = 8;
const TURF_MS = 360;
const SHAKE_DECAY_MS = 320;

const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
const easeOut = (t: number): number => 1 - (1 - t) ** 2;

export function flightMs(spec: ActionAnimationSpec): number {
  const speed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * spec.power;
  return Math.min(1100, Math.max(220, (distance(spec.from, spec.to) / speed) * 1000));
}

function ballAt(spec: ActionAnimationSpec, elapsedMs: number): BallPoint {
  const travel = flightMs(spec);

  if (elapsedMs < travel) {
    const u = clamp01(elapsedMs / travel);
    const eased = easeOut(u);
    return {
      x: spec.from.x + (spec.to.x - spec.from.x) * eased,
      y: spec.from.y + (spec.to.y - spec.from.y) * eased,
      h: spec.peakHeight * Math.sin(Math.PI * u),
    };
  }

  // Settled at the target. A goal drops into the net; anything else rests.
  const v = clamp01((elapsedMs - travel) / AFTERMATH_MS[spec.outcome]);
  return { x: spec.to.x, y: spec.to.y, h: spec.peakHeight * 0.12 * (1 - v) };
}

/** Turf kicked up at the strike — a deterministic fan, never random. */
function turfAt(spec: ActionAnimationSpec, elapsedMs: number): TurfSpeck[] {
  if (elapsedMs > TURF_MS || spec.peakHeight < 0.4) return [];

  const t = elapsedMs / TURF_MS;
  const specks: TurfSpeck[] = [];
  for (let i = 0; i < TURF_SPECKS; i += 1) {
    const angle = (i / TURF_SPECKS) * Math.PI * 2;
    const reach = (0.4 + ((i * 7) % 5) * 0.16) * t * (1 + spec.power);
    specks.push({
      x: spec.from.x + Math.cos(angle) * reach,
      y: spec.from.y + Math.sin(angle) * reach * 0.6,
      alpha: Math.max(0, 1 - t) * 0.7,
    });
  }
  return specks;
}

export function sampleActionAnimation(spec: ActionAnimationSpec, elapsedMs: number): TopDownFrame {
  const travel = flightMs(spec);
  const aftermath = AFTERMATH_MS[spec.outcome];
  const sinceImpact = elapsedMs - travel;
  const done = elapsedMs >= travel + aftermath;

  // Trail: earlier frames of the same function, only while travelling.
  const trail: BallPoint[] = [];
  if (elapsedMs < travel) {
    for (let i = 1; i <= TRAIL_SAMPLES; i += 1) {
      const t = elapsedMs - i * TRAIL_STEP_MS;
      if (t < 0) break;
      trail.push(ballAt(spec, t));
    }
  }

  const shakeStrength = spec.goal ? 0.5 : spec.outcome === 'post' ? 0.3 : 0.12;
  const shakeAmt =
    sinceImpact >= 0
      ? shakeStrength * Math.max(0, 1 - sinceImpact / SHAKE_DECAY_MS) ** 2
      : 0;

  return {
    ball: ballAt(spec, elapsedMs),
    trail,
    done,
    netImpact:
      spec.goal && sinceImpact >= 0
        ? { at: spec.to, strength: Math.max(0, 1 - sinceImpact / (aftermath + 100)) }
        : null,
    turf: turfAt(spec, elapsedMs),
    shakeX: shakeAmt * Math.sin(sinceImpact * 0.06),
    shakeY: shakeAmt * 0.7 * Math.cos(sinceImpact * 0.052),
    flash: spec.goal && sinceImpact >= 0 ? Math.max(0, 1 - sinceImpact / 240) ** 2 : 0,
  };
}
