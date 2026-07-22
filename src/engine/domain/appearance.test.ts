import { describe, expect, it } from 'vitest';

import { createRng } from '@/engine/rng';

import {
  BEARD_STYLES,
  DEFAULT_APPEARANCE,
  HAIR_COLOUR_COUNT,
  HAIR_STYLES,
  MAX_HEIGHT,
  MIN_HEIGHT,
  SKIN_TONE_COUNT,
  normaliseAppearance,
  randomAppearance,
} from './appearance';

const SEED = 20260721;

function manyAthletes(count: number) {
  const rng = createRng(SEED);
  return Array.from({ length: count }, () => randomAppearance(rng));
}

// The check that the renderer's palette covers these counts lives in
// render/palette.test.ts — engine/ cannot import render/, and the obligation
// is the palette's anyway.

describe('randomAppearance', () => {
  it('is deterministic for a seed', () => {
    expect(randomAppearance(createRng(7))).toEqual(randomAppearance(createRng(7)));
  });

  it('stays inside every legal range', () => {
    for (const athlete of manyAthletes(2000)) {
      expect(athlete.skinTone).toBeGreaterThanOrEqual(0);
      expect(athlete.skinTone).toBeLessThan(SKIN_TONE_COUNT);
      expect(athlete.hairColour).toBeGreaterThanOrEqual(0);
      expect(athlete.hairColour).toBeLessThan(HAIR_COLOUR_COUNT);
      expect(HAIR_STYLES).toContain(athlete.hairStyle);
      expect(BEARD_STYLES).toContain(athlete.beard);
      expect(athlete.build).toBeGreaterThanOrEqual(0);
      expect(athlete.build).toBeLessThanOrEqual(1);
    }
  });

  it('produces footballers, not giants and children', () => {
    const heights = manyAthletes(3000).map((a) => a.height);
    const mean = heights.reduce((sum, h) => sum + h, 0) / heights.length;

    expect(mean).toBeGreaterThan(1.76);
    expect(mean).toBeLessThan(1.86);
    for (const height of heights) {
      expect(height).toBeGreaterThan(1.55);
      expect(height).toBeLessThan(2.1);
    }
  });

  it('uses every skin tone and every hair style', () => {
    const athletes = manyAthletes(3000);
    expect(new Set(athletes.map((a) => a.skinTone)).size).toBe(SKIN_TONE_COUNT);
    expect(new Set(athletes.map((a) => a.hairStyle)).size).toBe(HAIR_STYLES.length);
  });

  it('keeps the loud styles rare, so a squad is not a costume party', () => {
    const athletes = manyAthletes(3000);
    const mohawks = athletes.filter((a) => a.hairStyle === 'mohawk').length;
    expect(mohawks / athletes.length).toBeLessThan(0.06);
    expect(mohawks).toBeGreaterThan(0);
  });

  it('makes a squad of eleven look like eleven different people', () => {
    const squad = manyAthletes(11);
    const signatures = new Set(
      squad.map((a) => `${String(a.skinTone)}-${a.hairStyle}-${a.beard}`),
    );
    expect(signatures.size).toBeGreaterThan(6);
  });
});

describe('normaliseAppearance', () => {
  it('pulls an out-of-range appearance back into the legal set', () => {
    const broken = normaliseAppearance({
      ...DEFAULT_APPEARANCE,
      skinTone: 99,
      hairColour: -3,
      height: 3,
      build: 5,
    });

    expect(broken.skinTone).toBe(SKIN_TONE_COUNT - 1);
    expect(broken.hairColour).toBe(0);
    expect(broken.height).toBe(MAX_HEIGHT);
    expect(broken.build).toBe(1);
  });

  it('clamps a height below the minimum', () => {
    expect(normaliseAppearance({ ...DEFAULT_APPEARANCE, height: 1 }).height).toBe(MIN_HEIGHT);
  });

  it('leaves a valid appearance untouched', () => {
    expect(normaliseAppearance(DEFAULT_APPEARANCE)).toEqual(DEFAULT_APPEARANCE);
  });
});
