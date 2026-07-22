/**
 * How an athlete looks.
 *
 * Plain, serialisable parameters — never colours. The domain says "skin tone
 * 2"; the renderer decides what that looks like. That separation is what lets
 * the art direction change without touching a single saved career, and what
 * keeps engine/ free of anything visual.
 *
 * This is the paper-doll, expressed as numbers instead of PNG layers.
 */
import type { Rng } from '@/engine/rng';

export const HAIR_STYLES = [
  'bald',
  'buzz',
  'short',
  'curly',
  'afro',
  'long',
  'mohawk',
] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

export const BEARD_STYLES = ['none', 'stubble', 'goatee', 'full'] as const;
export type BeardStyle = (typeof BEARD_STYLES)[number];

/**
 * How many options the renderer must provide a look for.
 *
 * Declared here rather than derived from the palette because engine/ cannot
 * import render/. A test keeps the two in step — if the palette ever grows a
 * skin tone without this counter following, generated athletes would silently
 * never use it.
 */
export const SKIN_TONE_COUNT = 5;
export const HAIR_COLOUR_COUNT = 5;

export interface Appearance {
  /** Index into the renderer's skin tones, 0..SKIN_TONE_COUNT-1. */
  readonly skinTone: number;
  readonly hairStyle: HairStyle;
  readonly hairColour: number;
  readonly beard: BeardStyle;
  /** Metres. Drives every other proportion. */
  readonly height: number;
  /** 0 slight, 1 powerful. */
  readonly build: number;
}

export const MIN_HEIGHT = 1.65;
export const MAX_HEIGHT = 1.98;

export const DEFAULT_APPEARANCE: Appearance = {
  skinTone: 2,
  hairStyle: 'short',
  hairColour: 0,
  beard: 'none',
  height: 1.8,
  build: 0.5,
};

/**
 * A plausible athlete.
 *
 * Hair styles are weighted rather than uniform: a squad where one man in
 * seven has a mohawk reads as a costume party, not a football team.
 */
export function randomAppearance(rng: Rng): Appearance {
  return {
    skinTone: rng.int(0, SKIN_TONE_COUNT - 1),
    hairStyle: rng.weighted([
      ['short', 5],
      ['buzz', 4],
      ['curly', 3],
      ['bald', 2],
      ['afro', 2],
      ['long', 1.2],
      ['mohawk', 0.4],
    ] as const),
    hairColour: rng.int(0, HAIR_COLOUR_COUNT - 1),
    beard: rng.weighted([
      ['none', 5],
      ['stubble', 3],
      ['goatee', 1.5],
      ['full', 2],
    ] as const),
    height: Math.round(rng.gaussian(1.81, 0.06) * 100) / 100,
    build: Math.round(rng.float(0, 1) * 100) / 100,
  };
}

/** Clamps a hand-edited or migrated appearance into legal ranges. */
export function normaliseAppearance(appearance: Appearance): Appearance {
  return {
    ...appearance,
    skinTone: Math.min(SKIN_TONE_COUNT - 1, Math.max(0, Math.round(appearance.skinTone))),
    hairColour: Math.min(HAIR_COLOUR_COUNT - 1, Math.max(0, Math.round(appearance.hairColour))),
    height: Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, appearance.height)),
    build: Math.min(1, Math.max(0, appearance.build)),
  };
}
