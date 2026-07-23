/**
 * Turning the player's aim into an action.
 *
 * The top-down promise: you look up, and where you aim decides what you do.
 * Point at the goal and it is a shot; point at a teammate and it is a pass;
 * a wide ball into the box is a cross. This module is the classifier and the
 * dispatcher — it reads the aim, decides the action, and hands off to the
 * shot or pass model, which do the actual resolving.
 *
 * Pure and deterministic. The aim is a direction plus power, exactly what the
 * slingshot control produces; nothing here knows about pixels or drags.
 */
import { CROSS_MIN_ABS_X } from '@/engine/balance/moment';
import { PASS_TARGET_TOLERANCE, SHOT_MAX_DISTANCE, SHOT_MOUTH_TOLERANCE } from '@/engine/balance/pass';
import { GOAL_HALF_WIDTH } from '@/engine/balance/shot';
import type { Point } from '@/engine/domain/pitch';
import {
  angleToGoal,
  directionTo,
  distanceToGoal,
  distanceToSegment,
  isInsideBox,
} from '@/engine/domain/pitch';
import type { Rng } from '@/engine/rng';

import type { PassResult } from './pass';
import { resolvePass } from './pass';
import type { ShotResult } from './shot';
import { resolveShot } from './shot';
import type { Actor, MatchMoment } from './spatialMoment';

export type ActionKind = 'shot' | 'pass' | 'cross' | 'through-ball';

/** The player's input: a unit direction on the pitch, and how hard he hit it. */
export interface Aim {
  readonly dir: Point;
  readonly power: number;
}

export interface PlayerSkills {
  readonly finishing: number;
  readonly passing: number;
  readonly dribbling: number;
  readonly composure: number;
  readonly keeperRating: number;
}

export interface ActionResult {
  readonly kind: ActionKind;
  /** Set when the action was a shot. */
  readonly shot: ShotResult | null;
  /** Set when the action was a pass, cross or through-ball. */
  readonly pass: PassResult | null;
  /** The teammate who received the ball, if any. */
  readonly receiverId: string | null;
  /** Did the team score directly from this action? */
  readonly goal: boolean;
  /** True if the player scored it himself; false if he set it up. */
  readonly scoredByPlayer: boolean;
  /** 0..1 quality of the chance created or taken — for the rating. */
  readonly quality: number;
}

const GOAL: Point = { x: 0, y: 0 };

/**
 * Where the aim ray crosses the goal line (y = 0), in metres.
 *
 * Infinity when the aim is not heading towards the line at all. This — not a
 * vague "is it pointing goalward" cone — is what tells a shot from a pass: a
 * wide ball played to a teammate near goal points goalward but crosses the
 * line thirty metres wide of the post.
 */
function goalLineCrossingX(ball: Point, aim: Aim): number {
  if (aim.dir.y >= -1e-3) return Infinity;
  const t = ball.y / -aim.dir.y;
  return ball.x + aim.dir.x * t;
}

/**
 * Which teammate, if any, the aim is played towards.
 *
 * The best-aligned teammate ahead of the aim ray, within tolerance of it —
 * so a slightly loose aim still finds the obvious man, but pointing into
 * empty space does not.
 */
function receiverFor(moment: MatchMoment, aim: Aim): Actor | null {
  let best: Actor | null = null;
  let bestOffset = PASS_TARGET_TOLERANCE;

  // A point far along the aim, to measure lane offset against.
  const far: Point = { x: moment.ball.x + aim.dir.x * 60, y: moment.ball.y + aim.dir.y * 60 };

  for (const mate of moment.teammates) {
    const toMate = directionTo(moment.ball, mate.point);
    // Only teammates roughly in the aimed direction.
    if (aim.dir.x * toMate.x + aim.dir.y * toMate.y < 0.3) continue;

    const offset = distanceToSegment(mate.point, moment.ball, far);
    if (offset < bestOffset) {
      bestOffset = offset;
      best = mate;
    }
  }

  return best;
}

export function classifyAction(moment: MatchMoment, aim: Aim): ActionKind {
  const crossX = goalLineCrossingX(moment.ball, aim);
  const aimedAtGoal =
    Math.abs(crossX) <= GOAL_HALF_WIDTH + SHOT_MOUTH_TOLERANCE &&
    distanceToGoal(moment.ball) <= SHOT_MAX_DISTANCE;

  if (aimedAtGoal) return 'shot';

  const receiver = receiverFor(moment, aim);
  if (receiver) {
    const wide = Math.abs(moment.ball.x) >= CROSS_MIN_ABS_X;
    return wide && isInsideBox(receiver.point) ? 'cross' : 'pass';
  }

  return 'through-ball';
}

/** The goal-line crossing as a normalised x for the shot model. */
function shotAimX(ball: Point, aim: Aim): number {
  return Math.max(-1.3, Math.min(1.3, goalLineCrossingX(ball, aim) / GOAL_HALF_WIDTH));
}

function defendersInShotLane(moment: MatchMoment): number {
  return moment.defenders.filter((d) => distanceToSegment(d.point, moment.ball, GOAL) < 2.5).length;
}

export function resolveAction(
  moment: MatchMoment,
  aim: Aim,
  skills: PlayerSkills,
  pressure: number,
  rng: Rng,
): ActionResult {
  const kind = classifyAction(moment, aim);

  if (kind === 'shot') {
    const shot = resolveShot(
      {
        aimX: shotAimX(moment.ball, aim),
        // Height is not controlled from above; a little variance keeps a shot
        // from being perfectly placed every time.
        aimY: 0.28 + rng.float(0, 0.28),
        power: aim.power,
        curve: 0,
      },
      {
        distance: distanceToGoal(moment.ball),
        angle: angleToGoal(moment.ball),
        defenders: defendersInShotLane(moment),
        finishing: skills.finishing,
        dribbling: skills.dribbling,
        composure: skills.composure,
        pressure,
        keeperRating: skills.keeperRating,
      },
      rng,
    );

    return {
      kind,
      shot,
      pass: null,
      receiverId: null,
      goal: shot.outcome === 'goal',
      scoredByPlayer: shot.outcome === 'goal',
      quality: shot.xG,
    };
  }

  // A pass, cross or ball into space.
  const receiver = receiverFor(moment, aim);
  const target: Point = receiver
    ? receiver.point
    : { x: moment.ball.x + aim.dir.x * 22, y: Math.max(0, moment.ball.y + aim.dir.y * 22) };

  const pass = resolvePass(
    {
      from: moment.ball,
      to: target,
      defenders: moment.defenders.map((d) => d.point),
      passing: skills.passing,
      composure: skills.composure,
      pressure,
      power: aim.power,
      isCross: kind === 'cross',
    },
    rng,
  );

  // A completed ball into a dangerous spot may be finished by the teammate.
  const scored = pass.outcome === 'complete' && rng.chance(pass.assistChance);

  return {
    kind,
    shot: null,
    pass,
    receiverId: receiver?.id ?? null,
    goal: scored,
    scoredByPlayer: false,
    quality: pass.assistChance,
  };
}
