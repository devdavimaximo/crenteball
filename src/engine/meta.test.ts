import { describe, expect, it } from 'vitest';

import { GAME_NAME, GAME_VERSION, SCHEMA_VERSION } from './meta';

describe('meta', () => {
  it('exposes the game name', () => {
    expect(GAME_NAME).toBe('Crenteball');
  });

  it('uses semantic versioning', () => {
    expect(GAME_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('schema version is a positive integer (save migrations key off it)', () => {
    expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
    expect(SCHEMA_VERSION).toBeGreaterThan(0);
  });
});
