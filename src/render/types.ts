/**
 * What the renderer draws.
 *
 * A scene is plain data assembled by the UI from a KeyMoment plus the
 * player's current aim. The renderer knows nothing about rules: it cannot
 * tell a penalty from open play except by what it is told to draw. That is
 * what keeps the swap-to-PixiJS door open (see MatchRenderer below).
 */

/** A body between the ball and the goal. Positions in metres, world space. */
export interface DefenderMarker {
  /** Lateral offset from the goal's centre line. Negative is left. */
  readonly x: number;
  /** Metres from the goal plane towards the shooter. */
  readonly depth: number;
}

/** Where the player is currently aiming, in the shot input's own units. */
export interface AimState {
  /** -1 left post .. 1 right post. */
  readonly x: number;
  /** 0 ground .. 1 crossbar. */
  readonly y: number;
  /**
   * Expected spread of the shot in metres — `aimingError` from the engine.
   * Drawn as the reticle's radius so a hard chance looks hard before the
   * player commits.
   */
  readonly spreadM: number;
}

export interface ShotScene {
  /** Metres from ball to goal line. */
  readonly distance: number;
  /** Degrees off the centre line. Negative is left. */
  readonly angle: number;
  readonly defenders: readonly DefenderMarker[];
  /** Keeper's lateral offset from goal centre, metres. */
  readonly keeperX: number;
  /** Null while the moment is being presented, set while aiming. */
  readonly aim: AimState | null;
  /**
   * Where the ball crossed the goal plane after a resolved shot, in metres
   * (world x, height y). Null before the shot. Flight animation is M3.5 —
   * until then this mark is the outcome's visual anchor.
   */
  readonly ballMark: { readonly x: number; readonly y: number } | null;
  /** Shirt colours, so the scene reads as "my club" at a glance. */
  readonly kit: { readonly primary: string; readonly secondary: string };
}

/**
 * The boundary the match UI talks to.
 *
 * Canvas 2D today; PixiJS tomorrow if profiling ever demands it — behind this
 * interface that swap touches no other file.
 */
export interface MatchRenderer {
  mount(canvas: HTMLCanvasElement): void;
  /** CSS pixels plus device pixel ratio; the renderer handles sharpness. */
  resize(width: number, height: number, devicePixelRatio: number): void;
  render(scene: ShotScene): void;
  destroy(): void;
}
