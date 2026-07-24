/**
 * What the top-down renderer draws.
 *
 * Plain data assembled by the UI from a spatial moment plus the player's aim.
 * The renderer knows no rules — it draws the snapshot it is handed. Metres and
 * pitch coordinates throughout (engine/domain/pitch); the camera turns them
 * into pixels.
 */
import type { Appearance } from '@/engine/domain/appearance';
import type { Point } from '@/engine/domain/pitch';
import type { ActionKind } from '@/engine/sim/action';

export interface Kit {
  readonly primary: string;
  readonly secondary: string;
}

/** A player on the pitch: where he is, and enough to draw him. */
export interface Figure {
  readonly at: Point;
  readonly kit: Kit;
  readonly appearance: Appearance;
  readonly shirtNumber?: number;
  /** Metres above the ground — a keeper leaps, a header rises. */
  readonly height?: number;
  /** A pitch point the figure looks towards, so he is not always facing away. */
  readonly face?: Point;
}

/** The aim, while the player is pulling back the slingshot. */
export interface AimIndicator {
  /** The ball's launch direction, unit vector in pitch space. */
  readonly dir: Point;
  /** 0..1 power — the arrow's length. */
  readonly power: number;
  /** What this aim would do, so the arrow can colour itself. */
  readonly kind: ActionKind;
}

/** Per-frame impact feedback, produced by the animation sampler. */
export interface TopDownEffects {
  readonly trail: readonly { x: number; y: number; h: number }[];
  readonly turf: readonly { x: number; y: number; alpha: number }[];
  readonly netImpact: { readonly at: Point; readonly strength: number } | null;
  /** Camera kick, in metres. */
  readonly shakeX: number;
  readonly shakeY: number;
  readonly flash: number;
}

export interface TopDownScene {
  /** The player with the ball — the camera follows him. */
  readonly player: Figure;
  readonly teammates: readonly Figure[];
  readonly defenders: readonly Figure[];
  readonly keeper: Figure;

  /** Ball position and how high off the ground it is, in metres. */
  readonly ball: Point;
  readonly ballHeight: number;

  /** Set while aiming, null otherwise. */
  readonly aim: AimIndicator | null;

  /** Camera target — usually the ball, but an animation may pan elsewhere. */
  readonly focus: Point;
}
