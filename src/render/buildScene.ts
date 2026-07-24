/**
 * Builds a render scene from an engine moment.
 *
 * The bridge between the two-speed simulation and the top-down view: it takes
 * a spatial moment (positions) plus who the player is (appearance, kit) and
 * produces the plain data the renderer draws. Kept out of the renderer so the
 * renderer stays a pure "draw what you are handed".
 */
import type { Appearance } from '@/engine/domain/appearance';
import { randomAppearance } from '@/engine/domain/appearance';
import type { Rng } from '@/engine/rng';
import type { MatchMoment } from '@/engine/sim/spatialMoment';

import type { AimIndicator, Figure, Kit, TopDownScene } from './topdownScene';

export interface SceneKits {
  readonly player: Kit;
  readonly opponent: Kit;
  readonly keeper: Kit;
}

export interface BuildSceneInput {
  readonly moment: MatchMoment;
  readonly appearance: Appearance;
  readonly kits: SceneKits;
  readonly rng: Rng;
  readonly aim?: AimIndicator | null;
  readonly ball?: { readonly at: { x: number; y: number }; readonly height: number };
  readonly focus?: { x: number; y: number };
}

function figure(at: { x: number; y: number }, kit: Kit, rng: Rng, number_?: number): Figure {
  return {
    at,
    kit,
    appearance: randomAppearance(rng),
    ...(number_ === undefined ? {} : { shirtNumber: number_ }),
  };
}

export function buildScene(input: BuildSceneInput): TopDownScene {
  const { moment, appearance, kits, rng } = input;
  const ball = input.ball ?? { at: moment.ball, height: 0 };

  return {
    player: { at: moment.ball, kit: kits.player, appearance, shirtNumber: 9 },
    teammates: moment.teammates.map((m, i) => figure(m.point, kits.player, rng, 7 + i)),
    defenders: moment.defenders.map((d) => figure(d.point, kits.opponent, rng)),
    keeper: figure(moment.keeper, kits.keeper, rng, 1),
    ball: ball.at,
    ballHeight: ball.height,
    aim: input.aim ?? null,
    focus: input.focus ?? moment.ball,
  };
}
