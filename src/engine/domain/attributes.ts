/**
 * The six attributes every player has.
 *
 * Universal on purpose: a centre-back and a striker train the same six, and it
 * is the *situation* that decides which ones are asked for. A shot weighs
 * finishing and physical; a tackle weighs defending and pace. That keeps every
 * position playable from the MVP without six separate progression systems.
 */
export const ATTRIBUTE_KEYS = [
  'finishing',
  'passing',
  'dribbling',
  'pace',
  'defending',
  'physical',
] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

export type Attributes = Record<AttributeKey, number>;

/**
 * Attributes live on a 1..99 scale.
 *
 * 99 is deliberately unreachable-in-practice rather than a cap players sit at:
 * a career with a visible ceiling is a career that ends before the player does
 * (design pillar 2 — progression with no ceiling).
 */
export const ATTRIBUTE_MIN = 1;
export const ATTRIBUTE_MAX = 99;

export function clampAttribute(value: number): number {
  return Math.min(ATTRIBUTE_MAX, Math.max(ATTRIBUTE_MIN, Math.round(value)));
}

/** Plain average of the six. A rough "how good am I" number for lists and UI. */
export function overall(attributes: Attributes): number {
  const total = ATTRIBUTE_KEYS.reduce((sum, key) => sum + attributes[key], 0);
  return Math.round(total / ATTRIBUTE_KEYS.length);
}

export function createAttributes(value: number): Attributes {
  const clamped = clampAttribute(value);
  return {
    finishing: clamped,
    passing: clamped,
    dribbling: clamped,
    pace: clamped,
    defending: clamped,
    physical: clamped,
  };
}
