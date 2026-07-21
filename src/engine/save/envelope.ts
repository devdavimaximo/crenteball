/**
 * The save envelope.
 *
 * A save is never just the game state — it is the state plus the schema
 * version it was written under. Without the version, there is no way to tell
 * a save apart from a future one, and no way to know which migrations to run.
 *
 * `state` is deliberately typed `unknown` here: at the envelope level we do
 * not yet know which schema version it satisfies. It only becomes a real
 * `GameState` after `migrate.ts` has walked it forward and `domain/schema.ts`
 * has validated the result.
 */
import { z } from 'zod';

import { SCHEMA_VERSION } from '@/engine/meta';

export interface SaveEnvelope {
  readonly schemaVersion: number;
  /** ISO 8601 — when this envelope was written, distinct from the career's `createdAt`. */
  readonly savedAt: string;
  readonly state: unknown;
}

/**
 * Validates only the envelope's outer shape. `state` must be an object (not
 * absent, not null, not a primitive) but its inner shape is not checked here —
 * that happens per-version, after migration.
 */
export const envelopeShapeSchema = z.object({
  schemaVersion: z.number().int().positive(),
  savedAt: z.string().datetime(),
  state: z.record(z.string(), z.unknown()),
});

export function createEnvelope(state: unknown, savedAt: string): SaveEnvelope {
  return { schemaVersion: SCHEMA_VERSION, savedAt, state };
}
