import { describe, expect, it } from 'vitest';

import { LIGA_BRASIL } from '@/content';
import { DEFAULT_APPEARANCE } from '@/engine/domain/appearance';
import { createAttributes } from '@/engine/domain/attributes';
import { SCHEMA_VERSION } from '@/engine/meta';
import { firstClubRngFor, startCareer } from '@/engine/systems/career';

import { parseSaveFile, serializeSaveFile, suggestFileName } from './file';

// A real career rather than a hand-built state: what goes through a file is
// what the game actually produces.
const STATE = startCareer(
  {
    seed: 99,
    name: 'Davi Máximo',
    position: 'MF',
    appearance: DEFAULT_APPEARANCE,
    createdAt: '2026-07-21T12:00:00.000Z',
    attributes: createAttributes(30),
  },
  LIGA_BRASIL,
  firstClubRngFor(99),
);

const SAVED_AT = '2026-07-21T15:30:00.000Z';

describe('export → import round trip', () => {
  it('recovers the exact state from the file text', () => {
    const text = serializeSaveFile(STATE, SAVED_AT);
    const result = parseSaveFile(text);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state).toEqual(STATE);
  });

  it('produces human-readable, pretty-printed JSON', () => {
    const text = serializeSaveFile(STATE, SAVED_AT);
    expect(text).toContain(`\n  "schemaVersion": ${String(SCHEMA_VERSION)}`);
  });
});

describe('parseSaveFile — hostile input', () => {
  it('rejects text that is not JSON at all', () => {
    expect(parseSaveFile('era uma vez um atacante')).toEqual({
      ok: false,
      error: { kind: 'not-json' },
    });
  });

  it('rejects a truncated download', () => {
    const text = serializeSaveFile(STATE, SAVED_AT);
    const truncated = text.slice(0, text.length / 2);
    const result = parseSaveFile(truncated);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('not-json');
  });

  it('rejects valid JSON that is not a save', () => {
    const result = parseSaveFile('{"receita":"bolo de fubá"}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('malformed-envelope');
  });

  it('rejects a save whose inner state was hand-edited into nonsense', () => {
    const text = serializeSaveFile(STATE, SAVED_AT);
    const tampered = text.replace('"age": 17', '"age": 170');
    const result = parseSaveFile(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid-state');
  });
});

describe('suggestFileName', () => {
  it('slugifies the player name with accents stripped', () => {
    expect(suggestFileName(STATE, SAVED_AT)).toBe(
      'crenteball-davi-maximo-2026-07-21.crenteball',
    );
  });

  it('falls back gracefully when the name has no usable characters', () => {
    const weird = { ...STATE, player: { ...STATE.player, name: '???' } };
    expect(suggestFileName(weird, SAVED_AT)).toBe('crenteball-carreira-2026-07-21.crenteball');
  });
});
