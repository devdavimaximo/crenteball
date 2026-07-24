/**
 * The career, as the UI holds it.
 *
 * Orchestration only (CLAUDE.md section 4): this store decides *when* to read
 * and write, never what a career is worth. Building the opening state belongs
 * to `engine/systems/career`, validating it to `engine/save`, and moving bytes
 * to `persistence/`. If a rule ever appears in this file, it is in the wrong
 * layer.
 *
 * There is one automatic slot, and every change to the state is written to it
 * immediately — a career game that loses a match because the tab crashed is a
 * career game nobody trusts.
 */
import { create } from 'zustand';

import { LIGA_BRASIL } from '@/content';
import type { Appearance } from '@/engine/domain/appearance';
import type { Attributes } from '@/engine/domain/attributes';
import type { GameState, Position } from '@/engine/domain/state';
import { seedFromString } from '@/engine/rng';
import type { LoadError } from '@/engine/save/load';
import { firstClubRngFor, startCareer } from '@/engine/systems/career';
import { AUTO_SLOT } from '@/persistence/db';
import { deleteSave, readSave, writeSave } from '@/persistence/saves';

/** What the creation screen collects. The engine turns it into a career. */
export interface CareerDraft {
  readonly name: string;
  readonly position: Position;
  readonly appearance: Appearance;
  readonly attributes: Attributes;
}

export type CareerStatus = 'loading' | 'empty' | 'ready' | 'error';

export interface CareerStore {
  readonly status: CareerStatus;
  readonly state: GameState | null;
  /** ISO 8601 of the last write, for the "last backup" indicator. */
  readonly savedAt: string | null;
  readonly error: LoadError | null;

  /** Reads the automatic slot. Called once, at boot. */
  load: () => Promise<void>;
  create: (draft: CareerDraft, now: Date) => Promise<void>;
  /** Persists a state the engine produced. Every system change lands here. */
  save: (next: GameState) => Promise<void>;
  discard: () => Promise<void>;
}

/**
 * A career's seed.
 *
 * Taken from the moment of creation rather than a random number, so nothing
 * in the app needs `Math.random()` and two players who write the same name at
 * the same instant genuinely get the same career — a property worth having
 * when someone reports a bug.
 */
function seedForCareer(name: string, createdAt: string): number {
  return seedFromString(`${name}@${createdAt}`);
}

export const useCareerStore = create<CareerStore>((set) => ({
  status: 'loading',
  state: null,
  savedAt: null,
  error: null,

  async load() {
    const result = await readSave(AUTO_SLOT);

    if (result.ok) {
      set({ status: 'ready', state: result.state, savedAt: result.savedAt, error: null });
      // A save that arrived from an older schema is only really migrated once
      // it is written back; otherwise every boot pays the migration again.
      if (result.migrated) await writeSave(result.state, AUTO_SLOT);
      return;
    }

    if (result.error.kind === 'empty-slot') {
      set({ status: 'empty', state: null, savedAt: null, error: null });
      return;
    }

    set({ status: 'error', state: null, savedAt: null, error: result.error as LoadError });
  },

  async create(draft, now) {
    const createdAt = now.toISOString();
    const seed = seedForCareer(draft.name, createdAt);

    const state = startCareer(
      {
        seed,
        name: draft.name,
        position: draft.position,
        appearance: draft.appearance,
        attributes: draft.attributes,
        createdAt,
      },
      LIGA_BRASIL,
      firstClubRngFor(seed),
    );

    const savedAt = createdAt;
    await writeSave(state, AUTO_SLOT, savedAt);
    set({ status: 'ready', state, savedAt, error: null });
  },

  async save(next) {
    const savedAt = new Date().toISOString();
    await writeSave(next, AUTO_SLOT, savedAt);
    set({ status: 'ready', state: next, savedAt, error: null });
  },

  async discard() {
    await deleteSave(AUTO_SLOT);
    set({ status: 'empty', state: null, savedAt: null, error: null });
  },
}));
