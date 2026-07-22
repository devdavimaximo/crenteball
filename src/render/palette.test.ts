import { describe, expect, it } from 'vitest';

import { HAIR_COLOUR_COUNT, SKIN_TONE_COUNT } from '@/engine/domain/appearance';

import { HAIR_COLOURS, SKIN_TONES } from './palette';

/**
 * The palette owes the domain a colour for every option it can generate.
 *
 * The obligation runs this way round because dependencies point inward:
 * engine/ declares how many skin tones exist and knows nothing about what
 * they look like.
 */
describe('the palette covers the domain', () => {
  it('has a colour for every skin tone the generator can produce', () => {
    // Without this, adding a palette entry silently leaves it unused, and
    // removing one produces athletes with no colour at all.
    expect(SKIN_TONES).toHaveLength(SKIN_TONE_COUNT);
  });

  it('has a colour for every hair colour the generator can produce', () => {
    expect(HAIR_COLOURS).toHaveLength(HAIR_COLOUR_COUNT);
  });

  it('gives every entry a valid hex colour', () => {
    for (const colour of [...SKIN_TONES, ...HAIR_COLOURS]) {
      expect(colour, colour).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('spreads skin tones across the range instead of clustering', () => {
    const brightness = SKIN_TONES.map((hex) => Number.parseInt(hex.slice(1, 3), 16));
    expect(Math.max(...brightness) - Math.min(...brightness)).toBeGreaterThan(120);
  });
});
