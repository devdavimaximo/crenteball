/**
 * Reading and writing saves to IndexedDB.
 *
 * This layer does IO and nothing else. Validation and migration belong to the
 * engine (`loadSave`); here we only move envelopes in and out of the database
 * and translate storage failures into typed results the UI can word in pt-br.
 */
import type { GameState } from '@/engine/domain/state';
import { createEnvelope } from '@/engine/save/envelope';
import type { LoadError } from '@/engine/save/load';
import { loadSave } from '@/engine/save/load';

import { AUTO_SLOT, db } from './db';

export type ReadSaveResult =
  | { readonly ok: true; readonly state: GameState; readonly savedAt: string; readonly migrated: boolean }
  | { readonly ok: false; readonly error: LoadError }
  | { readonly ok: false; readonly error: { readonly kind: 'empty-slot' } }
  | { readonly ok: false; readonly error: { readonly kind: 'storage-unavailable' } };

export interface SaveSummary {
  readonly slot: string;
  readonly savedAt: string;
  readonly schemaVersion: number;
}

/**
 * Persists the state into a slot. `savedAt` defaults to now — persistence is
 * infrastructure and may read the clock, unlike the engine — but stays
 * injectable so tests are reproducible.
 */
export async function writeSave(
  state: GameState,
  slot: string = AUTO_SLOT,
  savedAt: string = new Date().toISOString(),
): Promise<void> {
  await db.saves.put({ id: slot, envelope: createEnvelope(state, savedAt) });
}

/**
 * Reads a slot and runs the full engine pipeline on it (shape check,
 * migrations, domain validation). A record that IndexedDB returns but the
 * engine rejects is reported as the engine's typed error — never thrown.
 */
export async function readSave(slot: string = AUTO_SLOT): Promise<ReadSaveResult> {
  let record;
  try {
    record = await db.saves.get(slot);
  } catch {
    // Private-mode browsers and mid-eviction states can make IndexedDB itself
    // fail. That is an environment problem, not a corrupt save.
    return { ok: false, error: { kind: 'storage-unavailable' } };
  }

  if (!record) return { ok: false, error: { kind: 'empty-slot' } };

  const result = loadSave(record.envelope);
  if (!result.ok) return result;

  return {
    ok: true,
    state: result.state,
    savedAt: record.envelope.savedAt,
    migrated: result.migrated,
  };
}

/** Lists slots without loading full states — for a save screen with dates. */
export async function listSaves(): Promise<SaveSummary[]> {
  const records = await db.saves.toArray();
  return records.map((record) => ({
    slot: record.id,
    savedAt: record.envelope.savedAt,
    schemaVersion: record.envelope.schemaVersion,
  }));
}

export async function deleteSave(slot: string): Promise<void> {
  await db.saves.delete(slot);
}
