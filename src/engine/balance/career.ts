/**
 * Tuning constants for the start of a career.
 *
 * Every number the game balances on lives in balance/, never inline in the
 * rules. When `npm run sim:seasons` says careers peak too early, this is the
 * file to open — not six systems.
 */
import { fromUnits } from '@/engine/domain/money';

/** Where a youth player's six attributes start before any distribution. */
export const STARTING_ATTRIBUTE = 30;

/** Points the player distributes freely at career creation. */
export const STARTING_ATTRIBUTE_POINTS = 30;

/** Most a single attribute can be raised during creation, to prevent a 99/1 build. */
export const MAX_STARTING_ATTRIBUTE = 55;

export const STARTING_AGE = 17;

/** Energy and morale are percentages. A career starts rested and hopeful. */
export const STARTING_ENERGY = 100;
export const STARTING_MORALE = 60;

/**
 * Devotion — closeness to God — is the game's happiness stat.
 *
 * It starts modest rather than full: the first season should feel like
 * building the habit, not defending a bar that only goes down.
 */
export const STARTING_DEVOTION = 40;

export const DEVOTION_MIN = 0;
export const DEVOTION_MAX = 100;

/** A first professional contract does not make anyone rich. */
export const STARTING_BALANCE = fromUnits(500);

/** Seasons run on a weekly clock; week 1 is preseason. */
export const FIRST_SEASON = 1;
export const FIRST_WEEK = 1;
