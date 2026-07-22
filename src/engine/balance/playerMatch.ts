/**
 * Tuning for the match the player actually plays.
 *
 * Distinct from balance/match.ts, which governs matches between AI clubs.
 * Here the scoreline is part his doing and part the eight other outfield
 * players', and the split has to leave him decisive without making the rest
 * of the team spectators.
 */

/**
 * Share of the team's expected goals that come from anyone but the player.
 *
 * At 1 the player is irrelevant; at 0 he is the only footballer on the pitch.
 * 0.7 leaves room for a striker to be the difference in a tight game while
 * still losing matches his teammates threw away — which is the feeling a
 * career game is about.
 */
export const TEAMMATE_GOAL_SHARE = 0.7;

/**
 * Pressure: how much a moment matters.
 *
 * This is what composure — and therefore devotion — answers, so it has to
 * track what a player would actually feel: a tight game late is the moment
 * that defines a season; 2-0 up in the twentieth minute is not.
 */
export const BASE_PRESSURE = 0.15;

/** Extra pressure by the final whistle, on top of the base. */
export const LATE_MATCH_PRESSURE = 0.4;
/** The minute from which pressure starts climbing. */
export const PRESSURE_RAMP_FROM = 55;

/** A goal either way of level is where the game is still winnable and losable. */
export const TIGHT_GAME_PRESSURE = 0.3;
/** A dead rubber relieves it: this much is removed when three or more clear. */
export const BLOWOUT_RELIEF = 0.2;

/** Set pieces are their own kind of pressure, whatever the scoreline. */
export const PENALTY_PRESSURE_FLOOR = 0.65;

export const MAX_PRESSURE = 1;
