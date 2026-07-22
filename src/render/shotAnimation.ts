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

export interface AnimationFrame {
  readonly ball: { readonly x: number; readonly y: number; readonly metresFromGoal: number };
  readonly ballAlpha: number;
  readonly keeper: { readonly dive: number; readonly stretch: number };
  readonly done: boolean;
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

export function shotFlightMs(distance: number, power: number): number {
  const speed = MIN_BALL_SPEED + (MAX_BALL_SPEED - MIN_BALL_SPEED) * power;
  return Math.min(900, Math.max(260, (distance / speed) * 1000));
}

const easeOut = (t: number): number => 1 - (1 - t) ** 2;
const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

export function sampleShotAnimation(spec: ShotAnimationSpec, elapsedMs: number): AnimationFrame {
  const flightMs = shotFlightMs(spec.distance, spec.power);

  // A blocked shot never completes its flight.
  const blockedAt =
    spec.outcome === 'blocked'
      ? clamp01((spec.distance - spec.blockDepth) / spec.distance)
      : 1;

  const impactMs = flightMs * blockedAt;
  const aftermath = AFTERMATH_MS[spec.outcome];
  const done = elapsedMs >= impactMs + aftermath;

  const startX = ballWorldX(spec.distance, spec.angle);
  // Hard shots fly flatter; the arc is a presentation flourish, capped so a
  // daisy-cutter aimed low never visibly climbs.
  const arc = Math.min(1, spec.distance * 0.03) * (1 - spec.power * 0.55) * spec.targetY;

  if (elapsedMs < impactMs) {
    const u = elapsedMs / flightMs;
    return {
      ball: {
        x: startX + (spec.targetX - startX) * u,
        y: 0.11 + (Math.max(0.11, spec.targetY) - 0.11) * u + arc * Math.sin(Math.PI * u),
        metresFromGoal: spec.distance * (1 - u),
      },
      ballAlpha: 1,
      keeper: keeperAt(spec, elapsedMs, flightMs),
      done: false,
    };
  }

  const v = clamp01((elapsedMs - impactMs) / aftermath);
  return {
    ball: aftermathBall(spec, v, blockedAt),
    ballAlpha: spec.outcome === 'off-target' ? 1 - v * 0.7 : 1,
    keeper: keeperAt(spec, elapsedMs, flightMs),
    done,
  };
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
