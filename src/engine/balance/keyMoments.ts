/**
 * Tuning for the key moments a player gets in a match.
 *
 * This file decides the *rhythm* of the game's core loop. Too few moments and
 * a match is a spectator sport; too many and each one stops mattering. Four
 * or five is the target: enough that a bad one can be redeemed, few enough
 * that every one is worth leaning in for.
 */
import type { Position } from '@/engine/domain/state';

export type KeyMomentType =
  | 'shot'
  | 'header'
  | 'through-ball'
  | 'dribble'
  | 'cross'
  | 'free-kick'
  | 'penalty'
  | 'tackle'
  | 'save';

export const KEY_MOMENT_TYPES = [
  'shot',
  'header',
  'through-ball',
  'dribble',
  'cross',
  'free-kick',
  'penalty',
  'tackle',
  'save',
] as const;

/** A match hands the player this many decisive moments, before adjustments. */
export const BASE_MOMENTS = 4;
export const MIN_MOMENTS = 3;
export const MAX_MOMENTS = 6;

/**
 * A dominant side creates more; a side under siege creates fewer. Expressed
 * as extra moments per point of strength advantage.
 */
export const MOMENTS_PER_STRENGTH_POINT = 0.035;

/** Playing at home is worth a fraction of a moment. */
export const HOME_MOMENT_BONUS = 0.3;

/** Below this energy, a player stops getting into positions at all. */
export const ENERGY_REFERENCE = 70;
export const MAX_ENERGY_MOMENT_PENALTY = 1.5;

/**
 * How likely each moment type is, by position.
 *
 * A striker lives on shots and headers; a defender's decisive moments are
 * tackles and the occasional set-piece header. Goalkeepers get saves — kept
 * deliberately thin, since a keeper career is not an MVP concern and a
 * shot-stopping minigame is its own design problem.
 */
export const MOMENT_WEIGHTS: Readonly<Record<Position, Readonly<Record<KeyMomentType, number>>>> = {
  GK: {
    shot: 0,
    header: 0,
    'through-ball': 0.1,
    dribble: 0,
    cross: 0,
    'free-kick': 0,
    penalty: 0,
    tackle: 0.15,
    save: 1,
  },
  DF: {
    shot: 0.12,
    header: 0.35,
    'through-ball': 0.2,
    dribble: 0.08,
    cross: 0.25,
    'free-kick': 0.05,
    penalty: 0.02,
    tackle: 1,
    save: 0,
  },
  MF: {
    shot: 0.55,
    header: 0.15,
    'through-ball': 1,
    dribble: 0.6,
    cross: 0.5,
    'free-kick': 0.22,
    penalty: 0.06,
    tackle: 0.45,
    save: 0,
  },
  FW: {
    shot: 1,
    header: 0.45,
    'through-ball': 0.35,
    dribble: 0.6,
    cross: 0.4,
    'free-kick': 0.12,
    penalty: 0.1,
    tackle: 0.05,
    save: 0,
  },
};

/**
 * Where each kind of moment happens, as distance from goal in metres and
 * angle off the centre line in degrees.
 *
 * Geometry is generated here rather than at resolution time because it is
 * what the player *sees* — the pitch is drawn from these numbers, and the
 * shot they aim is the shot they were given.
 */
export const MOMENT_GEOMETRY: Readonly<
  Record<KeyMomentType, { distance: [number, number]; angle: number }>
> = {
  shot: { distance: [8, 30], angle: 38 },
  header: { distance: [3, 12], angle: 28 },
  'through-ball': { distance: [18, 45], angle: 45 },
  dribble: { distance: [15, 40], angle: 42 },
  cross: { distance: [12, 30], angle: 52 },
  'free-kick': { distance: [18, 32], angle: 30 },
  penalty: { distance: [11, 11], angle: 0 },
  tackle: { distance: [30, 75], angle: 50 },
  save: { distance: [6, 20], angle: 35 },
};

/**
 * The moment every player is guaranteed at least one of, per match.
 *
 * Without this, a striker goes a whole match without a shot roughly one game
 * in five — mathematically correct, and terrible to play. The minigame *is*
 * the game, and a match where the player never reaches theirs is a match they
 * only watched. Real football has quiet games; this is a game about a career,
 * and the quiet ones can be quiet in other ways.
 */
export const SIGNATURE_MOMENT: Readonly<Record<Position, KeyMomentType>> = {
  GK: 'save',
  DF: 'tackle',
  MF: 'through-ball',
  FW: 'shot',
};

/** How many opponents are in the way. Set pieces are, by definition, unopposed. */
export const MAX_DEFENDERS = 3;
export const UNOPPOSED_TYPES: readonly KeyMomentType[] = ['penalty', 'free-kick'];

/** Moments are spread across the match, never bunched into the same minute. */
export const FIRST_POSSIBLE_MINUTE = 3;
export const LAST_POSSIBLE_MINUTE = 90;
export const MIN_MINUTES_BETWEEN_MOMENTS = 6;
