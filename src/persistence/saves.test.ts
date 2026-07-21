// fake-indexeddb registers a global IndexedDB implementation so Dexie runs
// in Node exactly as it would in a browser.
import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';

import { createInitialState } from '@/engine/domain/state';
import { SCHEMA_VERSION } from '@/engine/meta';

import { AUTO_SLOT, db } from './db';
import { deleteSave, listSaves, readSave, writeSave } from './saves';

const STATE = createInitialState({
  seed: 7,
  name: 'Davi Máximo',
  position: 'FW',
  createdAt: '2026-07-21T12:00:00.000Z',
});

const SAVED_AT = '2026-07-21T15:30:00.000Z';

beforeEach(async () => {
  await db.saves.clear();
});

describe('writeSave / readSave', () => {
  it('round-trips a state through IndexedDB unchanged', async () => {
    await writeSave(STATE, AUTO_SLOT, SAVED_AT);

    const result = await readSave();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state).toEqual(STATE);
      expect(result.savedAt).toBe(SAVED_AT);
      expect(result.migrated).toBe(false);
    }
  });

  it('overwrites the slot on a second save — autosave semantics', async () => {
    await writeSave(STATE, AUTO_SLOT, SAVED_AT);

    const later = {
      ...STATE,
      clock: { season: 1, week: 5 },
    };
    await writeSave(later, AUTO_SLOT, '2026-07-22T10:00:00.000Z');

    const result = await readSave();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.clock.week).toBe(5);

    expect(await listSaves()).toHaveLength(1);
  });

  it('reports an empty slot as a typed result, not an exception', async () => {
    const result = await readSave('nunca-usado');
    expect(result).toEqual({ ok: false, error: { kind: 'empty-slot' } });
  });

  it('keeps separate slots independent', async () => {
    await writeSave(STATE, 'slot-a', SAVED_AT);
    const other = { ...STATE, clock: { season: 2, week: 1 } };
    await writeSave(other, 'slot-b', SAVED_AT);

    const a = await readSave('slot-a');
    const b = await readSave('slot-b');
    if (a.ok && b.ok) {
      expect(a.state.clock.season).toBe(1);
      expect(b.state.clock.season).toBe(2);
    }
    expect(a.ok && b.ok).toBe(true);
  });

  it('rejects a record whose envelope was corrupted in storage', async () => {
    // Simulates external corruption: something wrote garbage into the table.
    await db.saves.put({
      id: AUTO_SLOT,
      envelope: { schemaVersion: 1, savedAt: 'not-a-date', state: {} },
    });

    const result = await readSave();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('malformed-envelope');
  });
});

describe('listSaves', () => {
  it('summarises slots without exposing full states', async () => {
    await writeSave(STATE, AUTO_SLOT, SAVED_AT);

    expect(await listSaves()).toEqual([
      { slot: AUTO_SLOT, savedAt: SAVED_AT, schemaVersion: SCHEMA_VERSION },
    ]);
  });
});

describe('deleteSave', () => {
  it('empties the slot', async () => {
    await writeSave(STATE, AUTO_SLOT, SAVED_AT);
    await deleteSave(AUTO_SLOT);

    const result = await readSave();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('empty-slot');
  });
});
