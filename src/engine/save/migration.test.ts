import { describe, expect, it } from 'vitest';

import type { Migration } from './migration';
import { runMigrations } from './migration';

/**
 * Fictional two-step chain, invented purely to exercise the runner: v1 stores
 * a player's name as a bare string, v2 splits it into first/last, v3 adds a
 * nickname. None of this reflects Crenteball's real schema — see registry.ts
 * for that. The point is proving the *mechanism* independent of any one
 * game's history.
 */
const FICTIONAL_CHAIN: readonly Migration[] = [
  {
    from: 1,
    migrate: (state) => {
      const { name, ...rest } = state as { name: string };
      const [first, ...lastParts] = name.split(' ');
      return { ...rest, firstName: first, lastName: lastParts.join(' ') };
    },
  },
  {
    from: 2,
    migrate: (state) => ({ ...(state as object), nickname: null }),
  },
];

describe('runMigrations', () => {
  it('is a no-op when already at the target version', () => {
    const state = { untouched: true };
    const result = runMigrations(FICTIONAL_CHAIN, 3, 3, state);
    expect(result).toEqual({ ok: true, state });
  });

  it('applies a single migration', () => {
    const result = runMigrations(FICTIONAL_CHAIN, 2, 3, { firstName: 'Davi', lastName: 'Máximo' });
    expect(result).toEqual({
      ok: true,
      state: { firstName: 'Davi', lastName: 'Máximo', nickname: null },
    });
  });

  it('chains multiple migrations in order, v1 all the way to v3', () => {
    const result = runMigrations(FICTIONAL_CHAIN, 1, 3, { name: 'Davi Máximo' });
    expect(result).toEqual({
      ok: true,
      state: { firstName: 'Davi', lastName: 'Máximo', nickname: null },
    });
  });

  it('rejects a save from a schema version newer than this build supports', () => {
    const result = runMigrations(FICTIONAL_CHAIN, 5, 3, { anything: true });
    expect(result).toEqual({
      ok: false,
      failure: { kind: 'future-schema-version', savedVersion: 5, supportedVersion: 3 },
    });
  });

  it('rejects rather than skips when a step in the chain is missing', () => {
    // No migration registered `from: 2` in this shorter chain.
    const brokenChain: readonly Migration[] = [FICTIONAL_CHAIN[0] as Migration];
    const result = runMigrations(brokenChain, 1, 3, { name: 'Davi Máximo' });
    expect(result).toEqual({ ok: false, failure: { kind: 'missing-migration', version: 2 } });
  });

  it('never mutates the input state', () => {
    const state = { name: 'Davi Máximo' };
    const frozen = Object.freeze({ ...state });
    expect(() => runMigrations(FICTIONAL_CHAIN, 1, 3, frozen)).not.toThrow();
  });
});
