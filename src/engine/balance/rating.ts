/**
 * Match rating tuning.
 *
 * Ratings are the player's weekly verdict on himself: the number he sees
 * first, remembers, and chases. It has to reward the right things, or the
 * game teaches the wrong lesson — a rating that only counts goals turns
 * every match into shots from impossible angles.
 */

/** Where a rating starts: an anonymous, blameless afternoon. */
export const BASE_RATING = 6;

export const MIN_RATING = 1;
export const MAX_RATING = 10;

/**
 * A goal is worth a floor plus a bonus for how hard the chance was.
 *
 * Rating a tap-in the same as a strike from 25 yards would make the striker
 * who only ever gambles on the shoulder the highest-rated player in the
 * league. Chance quality comes from the engine's own `chanceQuality`.
 */
export const GOAL_BASE = 0.85;
export const GOAL_DIFFICULTY_BONUS = 0.95;

/**
 * Missing costs in proportion to how good the chance was.
 *
 * Skying a sitter is a story; dragging a half-chance wide from 30 metres is
 * a Tuesday. The multiplier is applied to chance quality, so the same miss
 * hurts differently depending on what it was.
 */
export const OFF_TARGET_PENALTY = 1.4;

/** A save is a shot on target — the keeper earns most of the credit back. */
export const SAVED_PENALTY = 0.55;

/** Woodwork is bad luck, and the game should read it that way. */
export const POST_PENALTY = 0.25;

/** A block is a defender's win more than a shooter's failure. */
export const BLOCKED_PENALTY = 0.4;

/** Every shot on target is a small positive, before its outcome is judged. */
export const ON_TARGET_CREDIT = 0.12;

/**
 * Ratings are shown to one decimal. Rounding at the boundary rather than in
 * the UI keeps every screen showing the same number for the same match.
 */
export const RATING_DECIMALS = 1;

/** A performance worth remembering — the threshold the UI highlights. */
export const STANDOUT_RATING = 8;
/** Below this, the player had a poor game. */
export const POOR_RATING = 5;
