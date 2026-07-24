// fake-indexeddb gives Dexie a real database in Node, so these tests exercise
// the actual persistence path rather than a mock of it.
import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';

import { LIGA_BRASIL } from '@/content';
import { DEFAULT_APPEARANCE } from '@/engine/domain/appearance';
import { createAttributes } from '@/engine/domain/attributes';
import { STARTING_ATTRIBUTE } from '@/engine/balance/career';
import { AUTO_SLOT, db } from '@/persistence/db';
import { readSave, writeSave } from '@/persistence/saves';

import { useCareerStore } from './careerStore';
import type { CareerDraft } from './careerStore';

const DRAFT: CareerDraft = {
  name: 'Davi Máximo',
  position: 'FW',
  appearance: DEFAULT_APPEARANCE,
  attributes: createAttributes(STARTING_ATTRIBUTE),
};

const NOW = new Date('2026-07-24T12:00:00.000Z');

const store = () => useCareerStore.getState();

beforeEach(async () => {
  await db.saves.clear();
  useCareerStore.setState({ status: 'loading', state: null, savedAt: null, error: null });
});

describe('load', () => {
  it('reports an empty slot rather than an error — a first run is not a failure', async () => {
    await store().load();
    expect(store().status).toBe('empty');
    expect(store().state).toBeNull();
  });

  it('picks up a career written by an earlier session', async () => {
    await store().create(DRAFT, NOW);
    const created = store().state;

    useCareerStore.setState({ status: 'loading', state: null, savedAt: null, error: null });
    await store().load();

    expect(store().status).toBe('ready');
    expect(store().state).toEqual(created);
  });

  it('surfaces a corrupt save instead of quietly starting over', async () => {
    await db.saves.put({
      id: AUTO_SLOT,
      envelope: { schemaVersion: 1, savedAt: NOW.toISOString(), state: { nonsense: true } },
    });

    await store().load();

    expect(store().status).toBe('error');
    expect(store().error?.kind).toBe('invalid-state');
    // The bad record is still there: recovering a career is the player's call.
    await expect(db.saves.get(AUTO_SLOT)).resolves.toBeDefined();
  });
});

describe('create', () => {
  it('writes the new career to the automatic slot straight away', async () => {
    await store().create(DRAFT, NOW);

    const persisted = await readSave(AUTO_SLOT);
    expect(persisted.ok).toBe(true);
    if (persisted.ok) expect(persisted.state).toEqual(store().state);
  });

  it('signs him to a club in the league the game ships with', async () => {
    await store().create(DRAFT, NOW);

    const contract = store().state?.contract;
    expect(contract?.leagueId).toBe(LIGA_BRASIL.id);
    expect(LIGA_BRASIL.clubs.map((club) => club.id)).toContain(contract?.clubId);
  });

  it('keeps the name, position and face the player chose', async () => {
    await store().create(DRAFT, NOW);

    const player = store().state?.player;
    expect(player?.name).toBe(DRAFT.name);
    expect(player?.position).toBe(DRAFT.position);
    expect(player?.appearance).toEqual(DEFAULT_APPEARANCE);
  });

  it('is reproducible — same name, same instant, same career', async () => {
    await store().create(DRAFT, NOW);
    const first = store().state;

    await db.saves.clear();
    await store().create(DRAFT, NOW);

    expect(store().state).toEqual(first);
  });

  it('gives careers created at different moments different seeds', async () => {
    await store().create(DRAFT, NOW);
    const first = store().state?.seed;

    await store().create(DRAFT, new Date('2026-07-24T12:00:01.000Z'));

    expect(store().state?.seed).not.toBe(first);
  });
});

describe('save', () => {
  it('persists what the engine produced, so a reload sees it', async () => {
    await store().create(DRAFT, NOW);
    const current = store().state;
    if (!current) throw new Error('career was not created');

    const advanced = { ...current, clock: { season: 1, week: 5 } };
    await store().save(advanced);

    const persisted = await readSave(AUTO_SLOT);
    expect(persisted.ok).toBe(true);
    if (persisted.ok) expect(persisted.state.clock.week).toBe(5);
  });
});

describe('discard', () => {
  it('empties the slot and returns to creation', async () => {
    await store().create(DRAFT, NOW);
    await store().discard();

    expect(store().status).toBe('empty');
    expect(store().state).toBeNull();
    await expect(db.saves.get(AUTO_SLOT)).resolves.toBeUndefined();
  });
});

describe('a save written by an older schema', () => {
  it('is rewritten at the current version, so the migration is paid once', async () => {
    await store().create(DRAFT, NOW);
    const current = store().state;
    if (!current) throw new Error('career was not created');

    // Downgrade the envelope in place: the state is v2-shaped but claims v1,
    // which is what a real pre-migration record looks like from outside.
    const { player, contract: _contract, ...rest } = current;
    const { appearance: _appearance, condition, ...playerRest } = player;
    const { form: _form, ...conditionRest } = condition;
    await db.saves.put({
      id: AUTO_SLOT,
      envelope: {
        schemaVersion: 1,
        savedAt: NOW.toISOString(),
        state: { ...rest, player: { ...playerRest, condition: conditionRest } },
      },
    });

    await store().load();
    expect(store().status).toBe('ready');

    const record = await db.saves.get(AUTO_SLOT);
    expect(record?.envelope.schemaVersion).toBe(2);
  });
});

describe('writeSave from an unrelated slot', () => {
  it('does not leak into the automatic slot', async () => {
    await store().create(DRAFT, NOW);
    const current = store().state;
    if (!current) throw new Error('career was not created');

    await writeSave(current, 'manual-1', NOW.toISOString());
    await store().discard();

    await expect(db.saves.get('manual-1')).resolves.toBeDefined();
    await expect(db.saves.get(AUTO_SLOT)).resolves.toBeUndefined();
  });
});
