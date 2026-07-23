/**
 * The player's moments, placed on the pitch.
 *
 * Supersedes the abstract distance/angle moment: a top-down view needs to
 * know where everyone actually stands, so the player can look up, see a
 * teammate in space, and choose to find him instead of shooting.
 *
 * Still the slow half of the two-speed world, still planned up front from a
 * seeded Rng. What changed is that a moment is now a little snapshot of the
 * pitch, not a pair of numbers.
 */
import type { KeyMomentType } from '@/engine/balance/keyMoments';
import { SIGNATURE_MOMENT } from '@/engine/balance/keyMoments';
import type { Range } from '@/engine/balance/moment';
import { KEEPER_LINE_Y, KEEPER_SHADE, MOMENT_ARCHETYPES } from '@/engine/balance/moment';
import type { Point } from '@/engine/domain/pitch';
import { clampToPitch, HALF_WIDTH } from '@/engine/domain/pitch';
import type { Rng, Seed } from '@/engine/rng';
import { createRng, deriveSeed } from '@/engine/rng';
import type { MatchPlanContext } from './keyMoments';
import { momentCountFor, pickMomentType, spreadMinutes } from './keyMoments';

export type { KeyMomentType };

export interface Actor {
  readonly id: string;
  readonly point: Point;
}

export interface MatchMoment {
  readonly id: string;
  readonly minute: number;
  readonly type: KeyMomentType;
  /** Where the player has the ball. */
  readonly ball: Point;
  /** Teammates he can pass to. */
  readonly teammates: readonly Actor[];
  /** Opponents on the pitch. */
  readonly defenders: readonly Actor[];
  /** The keeper's position. */
  readonly keeper: Point;
}

function inRange(range: Range, rng: Rng): number {
  return range.min === range.max ? range.min : rng.float(range.min, range.max);
}

/**
 * Places defenders between the ball and the goal.
 *
 * They sit along the ball→goal line at staggered depths, nudged sideways by
 * how much pressure the situation carries: at full pressure they stand right
 * in the shooting lane, at low pressure they are scattered and beatable.
 */
function placeDefenders(ball: Point, count: number, pressure: number, rng: Rng): Actor[] {
  const defenders: Actor[] = [];

  for (let i = 0; i < count; i += 1) {
    // Fraction of the way from ball to goal, spread across the group.
    const t = 0.25 + ((i + 1) / (count + 1)) * 0.55;
    const laneX = ball.x * (1 - t);
    const laneY = ball.y * (1 - t);

    // Off the lane by an amount that shrinks with pressure.
    const stray = (1 - pressure) * 6 + 1.5;
    const side = i % 2 === 0 ? -1 : 1;

    defenders.push({
      id: `def-${String(i)}`,
      point: clampToPitch({
        x: laneX + side * rng.float(0.5, stray) + rng.float(-1, 1),
        y: Math.max(1.5, laneY + rng.float(-2, 2)),
      }),
    });
  }

  return defenders;
}

function placeKeeper(ball: Point, rng: Rng): Point {
  return {
    // Shades towards the ball's side without ever leaving the goal.
    x: Math.max(-3.4, Math.min(3.4, ball.x * KEEPER_SHADE + rng.float(-0.3, 0.3))),
    y: KEEPER_LINE_Y,
  };
}

export function generateMatchMoment(
  type: KeyMomentType,
  minute: number,
  index: number,
  rng: Rng,
): MatchMoment {
  const archetype = MOMENT_ARCHETYPES[type];

  const ball = clampToPitch({
    x: inRange(archetype.ballX, rng),
    y: inRange(archetype.ballY, rng),
  });

  const teammates: Actor[] = archetype.teammates.map((slot, i) => ({
    id: `mate-${String(i)}`,
    point: clampToPitch({
      x: Math.max(-HALF_WIDTH, Math.min(HALF_WIDTH, inRange(slot.x, rng))),
      y: inRange(slot.y, rng),
    }),
  }));

  return {
    id: `moment-${String(index)}-${String(minute)}`,
    minute,
    type,
    ball,
    teammates,
    defenders: placeDefenders(ball, archetype.defenders, archetype.pressure, rng),
    keeper: placeKeeper(ball, rng),
  };
}

/**
 * Plans every moment of the player's match.
 *
 * Reuses the count, timing and type-by-position logic already proven for the
 * abstract moments; only the spatial placement is new.
 */
export function generateMatchMoments(context: MatchPlanContext, rng: Rng): MatchMoment[] {
  const count = momentCountFor(context, rng);
  const minutes = spreadMinutes(count, rng);
  const types = minutes.map(() => pickMomentType(context.position, rng));

  // Guarantee the signature moment, as the abstract generator did.
  const signature = SIGNATURE_MOMENT[context.position];
  if (!types.includes(signature)) {
    types[rng.int(0, types.length - 1)] = signature;
  }

  return minutes.map((minute, index) =>
    generateMatchMoment(types[index] as KeyMomentType, minute, index, rng),
  );
}

export function matchMomentsRngFor(
  seed: Seed,
  season: number,
  round: number,
  playerId: string,
): Rng {
  return createRng(deriveSeed(seed, 'match-moments', season, round, playerId));
}
