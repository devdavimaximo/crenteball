import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createInitialState } from '@/engine/domain/state';

import { createEnvelope } from './envelope';
import { loadSave } from './load';

const FIXTURE_PATH = fileURLToPath(new URL('./__fixtures__/v1-fresh-career.crenteball', import.meta.url));

function readFixture(): unknown {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
}

describe('loadSave — the v1 fixture (regression guard)', () => {
  it('loads today, unmigrated', () => {
    const result = loadSave(readFixture());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.migrated).toBe(false);
  });

  it('matches exactly what the engine produces for the same inputs today', () => {
    // This is the guard that matters: if createInitialState's shape ever
    // drifts from this hand-authored fixture without a migration being
    // added, this is the test that catches it — not a player's bug report.
    const expected = createInitialState({
      seed: 19_700_101,
      name: 'Davi Máximo',
      position: 'FW',
      createdAt: '2026-07-21T12:00:00.000Z',
    });

    const result = loadSave(readFixture());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state).toEqual(expected);
  });
});

describe('loadSave — round trip', () => {
  it('createEnvelope followed by loadSave returns the original state', () => {
    const original = createInitialState({
      seed: 42,
      name: 'Teste',
      position: 'GK',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const result = loadSave(createEnvelope(original, '2026-01-01T00:00:00.000Z'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toEqual(original);
      expect(result.migrated).toBe(false);
    }
  });
});

describe('loadSave — malformed envelope', () => {
  it.each([
    ['null', null],
    ['a string', 'not a save'],
    ['an array', []],
    ['missing schemaVersion', { savedAt: '2026-01-01T00:00:00.000Z', state: {} }],
    ['missing state', { schemaVersion: 1, savedAt: '2026-01-01T00:00:00.000Z' }],
    ['state as a primitive', { schemaVersion: 1, savedAt: '2026-01-01T00:00:00.000Z', state: 'nope' }],
    ['a non-ISO savedAt', { schemaVersion: 1, savedAt: 'yesterday', state: {} }],
    ['a negative schemaVersion', { schemaVersion: -1, savedAt: '2026-01-01T00:00:00.000Z', state: {} }],
  ])('rejects %s instead of throwing', (_label, input) => {
    const result = loadSave(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('malformed-envelope');
  });
});

describe('loadSave — future schema version', () => {
  it('refuses to load a save from a version this build does not know', () => {
    const result = loadSave({
      schemaVersion: 999,
      savedAt: '2026-01-01T00:00:00.000Z',
      state: {},
    });

    expect(result).toEqual({
      ok: false,
      error: { kind: 'future-schema-version', savedVersion: 999, supportedVersion: 1 },
    });
  });
});

describe('loadSave — state fails domain validation', () => {
  it('rejects an out-of-range attribute even though the envelope shape is fine', () => {
    const good = createInitialState({
      seed: 1,
      name: 'X',
      position: 'MF',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const broken = {
      ...good,
      player: { ...good.player, attributes: { ...good.player.attributes, pace: 250 } },
    };

    const result = loadSave(createEnvelope(broken, '2026-01-01T00:00:00.000Z'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid-state');
      if (result.error.kind === 'invalid-state') {
        expect(result.error.issues.join()).toContain('pace');
      }
    }
  });

  it('rejects fractional money smuggled in through a hand-edited file', () => {
    const good = createInitialState({
      seed: 1,
      name: 'X',
      position: 'DF',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const broken = { ...good, finances: { balance: 199.99 } };

    const result = loadSave(createEnvelope(broken, '2026-01-01T00:00:00.000Z'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid-state');
  });
});
