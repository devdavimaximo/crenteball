/**
 * Spatial layout tuning for the player's moments.
 *
 * Where the ball, teammates and defenders stand for each kind of moment. This
 * is what the top-down view draws and what the pass/shot/cross resolution
 * reads — so it decides both how a moment *looks* and how it *plays*.
 *
 * Coordinates follow src/engine/domain/pitch.ts: y is metres from the
 * attacking goal, x is across it.
 */
import type { KeyMomentType } from './keyMoments';

export interface Range {
  readonly min: number;
  readonly max: number;
}

export interface MomentArchetype {
  /** Where the player receives the ball. */
  readonly ballX: Range;
  readonly ballY: Range;
  /** Teammates available as pass targets, and roughly where they are. */
  readonly teammates: readonly { readonly x: Range; readonly y: Range }[];
  /** How many defenders, and how tightly they sit between ball and goal. */
  readonly defenders: number;
  /** 0 loose, 1 defenders sit right in the shooting/passing lanes. */
  readonly pressure: number;
}

/**
 * One archetype per moment type.
 *
 * The layouts are drawn from how each situation actually happens: a header is
 * a crowded six-yard box, a through-ball is space in front of a running
 * teammate, a cross is a wide player with bodies in the middle.
 */
export const MOMENT_ARCHETYPES: Readonly<Record<KeyMomentType, MomentArchetype>> = {
  shot: {
    ballX: { min: -14, max: 14 },
    ballY: { min: 8, max: 24 },
    teammates: [{ x: { min: -16, max: 16 }, y: { min: 6, max: 18 } }],
    defenders: 2,
    pressure: 0.6,
  },
  header: {
    ballX: { min: -8, max: 8 },
    ballY: { min: 3, max: 11 },
    teammates: [{ x: { min: -10, max: 10 }, y: { min: 4, max: 12 } }],
    defenders: 2,
    pressure: 0.8,
  },
  'through-ball': {
    ballX: { min: -18, max: 18 },
    ballY: { min: 24, max: 42 },
    teammates: [
      { x: { min: -20, max: 0 }, y: { min: 8, max: 20 } },
      { x: { min: 0, max: 20 }, y: { min: 8, max: 20 } },
    ],
    defenders: 2,
    pressure: 0.4,
  },
  dribble: {
    ballX: { min: -16, max: 16 },
    ballY: { min: 14, max: 30 },
    teammates: [{ x: { min: -22, max: 22 }, y: { min: 10, max: 22 } }],
    defenders: 1,
    pressure: 0.9,
  },
  cross: {
    ballX: { min: 20, max: 30 },
    ballY: { min: 8, max: 24 },
    teammates: [
      { x: { min: -6, max: 6 }, y: { min: 4, max: 12 } },
      { x: { min: -12, max: 2 }, y: { min: 6, max: 14 } },
    ],
    defenders: 3,
    pressure: 0.7,
  },
  'free-kick': {
    ballX: { min: -18, max: 18 },
    ballY: { min: 18, max: 30 },
    teammates: [{ x: { min: -20, max: 20 }, y: { min: 6, max: 14 } }],
    defenders: 3,
    pressure: 1,
  },
  penalty: {
    ballX: { min: 0, max: 0 },
    ballY: { min: 11, max: 11 },
    teammates: [],
    defenders: 0,
    pressure: 0,
  },
  // Defensive moments do not put the ball at the player's feet, so they get a
  // minimal attacking layout for now — the striker's MVP rarely sees them.
  tackle: {
    ballX: { min: -20, max: 20 },
    ballY: { min: 30, max: 50 },
    teammates: [{ x: { min: -20, max: 20 }, y: { min: 20, max: 40 } }],
    defenders: 1,
    pressure: 0.5,
  },
  save: {
    ballX: { min: -6, max: 6 },
    ballY: { min: 6, max: 14 },
    teammates: [],
    defenders: 0,
    pressure: 0,
  },
};

/** The keeper stands a little off his line, shading towards the ball. */
export const KEEPER_LINE_Y = 0.7;
export const KEEPER_SHADE = 0.35;

/** A crossing situation reads as wide when the ball is at least this far out. */
export const CROSS_MIN_ABS_X = 16;
