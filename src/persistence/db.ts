/**
 * The IndexedDB database, via Dexie.
 *
 * IndexedDB rather than localStorage: no ~5 MB ceiling, async access that
 * never blocks a match frame, and room for multiple slots later.
 *
 * The table stores whole save envelopes keyed by slot id. The MVP uses a
 * single automatic slot (`AUTO_SLOT`), but the schema is already slot-shaped
 * so adding manual slots is a feature, not a migration.
 */
import Dexie from 'dexie';
import type { EntityTable } from 'dexie';

import type { SaveEnvelope } from '@/engine/save/envelope';

export interface SaveRecord {
  /** Slot id — the primary key. */
  readonly id: string;
  readonly envelope: SaveEnvelope;
}

export const AUTO_SLOT = 'auto';

export class CrenteballDatabase extends Dexie {
  saves!: EntityTable<SaveRecord, 'id'>;

  constructor() {
    super('crenteball');
    // Bumping THIS version is about IndexedDB table layout only. The shape of
    // the game state inside an envelope is governed by SCHEMA_VERSION and the
    // engine's migration chain — two independent version numbers on purpose.
    this.version(1).stores({ saves: 'id' });
  }
}

export const db = new CrenteballDatabase();
