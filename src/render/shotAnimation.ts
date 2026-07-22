/**
 * The shot's aftermath as a function of time.
 *
 * Pure sampling: `(spec, elapsedMs) -> frame`. No timers, no easing library,
 * no state — whoever owns the clock (the screen's requestAnimationFrame loop)
 * asks for frames and draws them. That keeps the whole animation testable at
 * any instant and immune to dropped frames: a slow device skips frames, never
 * desynchronises.
 *
 * Timing constants live here, not in engine/balance: how long a save takes to
 * read is presentation, not game balance. The outcome was already decided
 * before the first frame — nothing here can change it, only show it.
 */
import { GOAL_HALF_WIDTH } from '@/engine/balance/shot';
import type { ShotOutcome } from '@/engine/sim/shot';

import { ballWorldX } from './projection';

export interface ShotAnimationSpec {
  readonly distance: number;
  readonly angle: number;
  /** Where the engine said the ball crossed the goal plane. */
  readonly targetX: number;
  readonly targetY: number;
  readonly outcome: ShotOutcome;
  readonly power: number;
  readonly keeperX: number;
  /** Metres from goal where the block happened. Only read when blocked. */
  readonly blockDepth: number;
}

export interface BallPoint {
  readonly x: number;
  readonly y: number;
  readonly metresFromGoal: number;
}

export interface TurfSpeck extends BallPoint {
  readonly alpha: number;
}

export interface AnimationFrame {
  readonly ball: BallPoint;
  readonly ballAlpha: number;
  readonly keeper: { readonly dive: number; readonly stretch: number };
  readonly done: boolean;

  /** Ghosts of where the ball just was. Oldest last. */
  readonly trail: readonly BallPoint[];
  /** Where the ball struck the net, in goal-plane metres, and how hard. */
  readonly netImpact: { readonly x: number; readonly y: number; readonly strength: number } | null;
  /** Turf kicked up by the strike. */
  readonly turf: readonly TurfSpeck[];
  /** Screen shake, in fractions of the viewport's smaller side. */
  readonly shakeX: number;
  readonly shakeY: number;
  /** 0..1 white bloom on the goal. */
  readonly flash: number;
}

/** Ball speed range in m/s — a placed shot floats, a blasted one fizzes. */
const MIN_BALL_SPEED = 16;
const MAX_BALL_SPEED = 34;

/** How long each outcome lingers after impact, in ms. */
const AFTERMATH_MS: Readonly<Record<ShotOutcome, number>> = {
  goal: 550,
  saved: 500,
  post: 550,
  'off-target': 380,
  blocked: 420,
};

const KEEPER_REACTION = 0.35;

/**
 * Hitstop: the world holds still for a moment on impact.
 *
 * The oldest trick in action games and the cheapest way to make contact feel
 * like contact. Implemented by freezing the animation's clock rather than by
 * holding state, so the frame function stays a pure function of elapsed time.
 */
const FREEZE_MS: Readonly<Record<ShotOutcome, number>> = {
  goal: 110,
  post: 90,
  saved: 70,
  blocked: 60,
  'off-target': 0,
};

/** How hard the frame shakes on impact, as a fraction of the viewport. */
const SHAKE_STRENGTH: Readonly<Record<ShotOutcome, number>> = {
  goal: 0.014,
  post: 0.011,
  saved: 0.005,
  blocked: 0.004,
  'off-target': 0,
};
const SHAKE_DECAY_MS = 340;
const SHAKE_FREQUENCY = 0.055;

/**
 * The trail hugs the ball rather than stretching back down the pitch: at a
 * 16ms step the ghosts spread across half the field and read as litter.
 */
const TRAIL_SAMPLES = 7;
const TRAIL_STEP_MS = 8;

const TURF_SPECKS = 7;
const TURF_MS = 420;

export function shotFlightMs(distance: number, power: number): number {
  const speed = MIN_BALL_SPEED + (MAX_BALL_SPEED - MIN_BALL_SPEED) * power;
  return Math.min(900, Math.max(260, (distance / speed) * 1000));
}

const easeOut = (t: number): number => 1 - (1 - t) ** 2;
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

/** The ball alone, at a given point on the animation's own clock. */
function ballAt(spec: ShotAnimationSpec, animMs: number): BallPoint {
  const flightMs = shotFlightMs(spec.distance, spec.power);
  const blockedAt = blockedFraction(spec);
  const impactMs = flightMs * blockedAt;

  const startX = ballWorldX(spec.distance, spec.angle);
  // Hard shots fly flatter; the arc is a presentation flourish, capped so a
  // daisy-cutter aimed low never visibly climbs.
  const arc = Math.min(1, spec.distance * 0.03) * (1 - spec.power * 0.55) * spec.targetY;

  if (animMs < impactMs) {
    const u = clamp01(animMs / flightMs);
    return {
      x: startX + (spec.targetX - startX) * u,
      y: 0.11 + (Math.max(0.11, spec.targetY) - 0.11) * u + arc * Math.sin(Math.PI * u),
      metresFromGoal: spec.distance * (1 - u),
    };
  }

  const v = clamp01((animMs - impactMs) / AFTERMATH_MS[spec.outcome]);
  return aftermathBall(spec, v, blockedAt);
}

function blockedFraction(spec: ShotAnimationSpec): number {
  return spec.outcome === 'blocked'
    ? clamp01((spec.distance - spec.blockDepth) / spec.distance)
    : 1;
}

export function sampleShotAnimation(spec: ShotAnimationSpec, elapsedMs: number): AnimationFrame {
  const flightMs = shotFlightMs(spec.distance, spec.power);
  const blockedAt = blockedFraction(spec);
  const impactMs = flightMs * blockedAt;
  const freeze = FREEZE_MS[spec.outcome];

  // Freeze the animation's clock across the hitstop window. Effects that
  // should keep moving during it — shake, the flash — read the real clock.
  const animMs =
    elapsedMs <= impactMs
      ? elapsedMs
      : elapsedMs < impactMs + freeze
        ? impactMs
        : elapsedMs - freeze;

  const aftermath = AFTERMATH_MS[spec.outcome];
  const done = animMs >= impactMs + aftermath;
  const sinceImpact = elapsedMs - impactMs;

  const ball = ballAt(spec, animMs);
  const inFlight = animMs < impactMs;

  const v = clamp01((animMs - impactMs) / aftermath);
  const ballAlpha = !inFlight && spec.outcome === 'off-target' ? 1 - v * 0.7 : 1;

  // Trail: earlier frames of the same pure function. Only while the ball is
  // actually travelling — a ball rolling in the net does not smear.
  const trail: BallPoint[] = [];
  if (inFlight) {
    for (let i = 1; i <= TRAIL_SAMPLES; i += 1) {
      const t = animMs - i * TRAIL_STEP_MS;
      if (t < 0) break;
      trail.push(ballAt(spec, t));
    }
  }

  // Shake decays from the moment of impact, on the real clock.
  const shakeAmount =
    sinceImpact >= 0
      ? SHAKE_STRENGTH[spec.outcome] * Math.max(0, 1 - sinceImpact / SHAKE_DECAY_MS) ** 2
      : 0;

  return {
    ball,
    ballAlpha,
    keeper: keeperAt(spec, animMs, flightMs),
    done,
    trail,
    netImpact:
      spec.outcome === 'goal' && sinceImpact >= 0
        ? {
            x: spec.targetX,
            y: spec.targetY,
            strength: Math.max(0, 1 - sinceImpact / (aftermath + freeze)),
          }
        : null,
    turf: turfAt(spec, animMs),
    shakeX: shakeAmount * Math.sin(sinceImpact * SHAKE_FREQUENCY),
    shakeY: shakeAmount * 0.6 * Math.cos(sinceImpact * SHAKE_FREQUENCY * 1.37),
    flash:
      spec.outcome === 'goal' && sinceImpact >= 0
        ? Math.max(0, 1 - sinceImpact / 220) ** 2
        : 0,
  };
}

/**
 * Turf kicked up by the strike.
 *
 * Deterministic fan of specks, not random: the renderer and this function
 * must produce the same frame every time, or a replay would differ from the
 * shot the player watched.
 */
function turfAt(spec: ShotAnimationSpec, animMs: number): TurfSpeck[] {
  if (animMs > TURF_MS) return [];

  const t = animMs / TURF_MS;
  const startX = ballWorldX(spec.distance, spec.angle);
  const specks: TurfSpeck[] = [];

  for (let i = 0; i < TURF_SPECKS; i += 1) {
    const spread = (i / (TURF_SPECKS - 1) - 0.5) * 2;
    const speed = 0.55 + ((i * 7) % 5) * 0.12;

    specks.push({
      x: startX + spread * speed * t * 1.5,
      // Up, then down: a parabola on the speck's own little life.
      y: Math.max(0, (0.55 * speed * t - 0.85 * t * t) * 1.6),
      metresFromGoal: spec.distance - speed * t * 1.2,
      alpha: Math.max(0, 1 - t) * 0.75,
    });
  }

  return specks;
}

function keeperAt(
  spec: ShotAnimationSpec,
  elapsedMs: number,
  flightMs: number,
): AnimationFrame['keeper'] {
  // No reason to move for a shot that never reaches the goal.
  const commitment =
    spec.outcome === 'saved' ? 1 : spec.outcome === 'goal' || spec.outcome === 'post' ? 0.75 : 0.3;

  const reactionMs = flightMs * KEEPER_REACTION;
  const k = easeOut(clamp01((elapsedMs - reactionMs) / (flightMs - reactionMs + 120)));

  return {
    dive: Math.sign(spec.targetX - spec.keeperX) * k * commitment,
    stretch: k * commitment,
  };
}

function aftermathBall(
  spec: ShotAnimationSpec,
  v: number,
  blockedAt: number,
): AnimationFrame['ball'] {
  const e = easeOut(v);
  const groundY = 0.11;

  switch (spec.outcome) {
    case 'goal':
      // Into the net, settling.
      return {
        x: spec.targetX,
        y: Math.max(groundY, spec.targetY - e * spec.targetY * 0.6),
        metresFromGoal: -0.7 * e,
      };

    case 'saved':
      // Parried back into play, dying on the ground.
      return {
        x: spec.targetX + Math.sign(spec.targetX || 1) * 1.6 * e,
        y: Math.max(groundY, spec.targetY * (1 - e) + 0.05),
        metresFromGoal: 4.5 * e,
      };

    case 'post':
      // Off the woodwork, back towards the pitch.
      return {
        x: Math.sign(spec.targetX) * (GOAL_HALF_WIDTH - 1.4 * e),
        y: Math.max(groundY, spec.targetY * (1 - e * 0.8)),
        metresFromGoal: 5.5 * e,
      };

    case 'off-target':
      // Sails on past the plane, fading.
      return {
        x: spec.targetX * (1 + 0.25 * v),
        y: Math.max(groundY, spec.targetY + v * 0.8),
        metresFromGoal: -3 * v,
      };

    case 'blocked': {
      // Ricochet off the defender, dropping dead.
      const blockM = spec.distance * (1 - blockedAt);
      return {
        x: spec.targetX * blockedAt + Math.sign(spec.targetX || 1) * 1.2 * e,
        y: Math.max(groundY, 0.6 * (1 - e)),
        metresFromGoal: blockM + 2.5 * e,
      };
    }
  }
}
