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

/** Energy, morale and form are percentages. A career starts rested and hopeful. */
export const STARTING_ENERGY = 100;
export const STARTING_MORALE = 60;

/**
 * Form is the short-term memory of recent performances, and it starts neutral:
 * nobody arrives in a first team already in a run of good or bad games.
 */
export const STARTING_FORM = 50;

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

/**
 * How many of the league's weakest clubs can give a 17-year-old his first
 * chance.
 *
 * Nobody starts at the top: the arc of the game is climbing from a club with
 * nothing to lose to one with everything to defend (design pillar 2). A pool
 * rather than a single club keeps two careers from opening identically.
 */
export const FIRST_CLUB_POOL = 5;

/**
 * A first weekly wage, as a function of the club's reputation.
 *
 * Linear on purpose — at this end of the career there is no negotiation, no
 * agent and no leverage; a bigger club simply pays more. Wages that respond to
 * performance belong to contracts (M6), not here.
 */
export const FIRST_WAGE_BASE = fromUnits(400);
export const FIRST_WAGE_PER_REPUTATION = fromUnits(20);

/** Seasons a first contract runs for, counting the one it is signed in. */
export const FIRST_CONTRACT_SEASONS = 3;

/** Seasons run on a weekly clock; week 1 is preseason. */
export const FIRST_SEASON = 1;
export const FIRST_WEEK = 1;
