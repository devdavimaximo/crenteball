/**
 * Turns an unknown value — parsed JSON from IndexedDB or an imported file —
 * into a validated, current-schema GameState.
 *
 * Every failure is a typed reason, never a prose string: the engine does not
 * decide how to word a player-facing error (see CLAUDE.md section 3 — UI text
 * lives in ui/i18n, in pt-br). This is the boundary that keeps that separate.
 */
import { parseGameState } from '@/engine/domain/schema';
import type { GameState } from '@/engine/domain/state';
import { SCHEMA_VERSION } from '@/engine/meta';

import { envelopeShapeSchema } from './envelope';
import { runMigrations } from './migration';
import { MIGRATIONS } from './registry';

export type LoadError =
  | { readonly kind: 'malformed-envelope'; readonly issues: readonly string[] }
  | { readonly kind: 'future-schema-version'; readonly savedVersion: number; readonly supportedVersion: number }
  | { readonly kind: 'missing-migration'; readonly version: number }
  | { readonly kind: 'invalid-state'; readonly issues: readonly string[] };

export type LoadResult =
  | { readonly ok: true; readonly state: GameState; readonly migrated: boolean }
  | { readonly ok: false; readonly error: LoadError };

export function loadSave(raw: unknown): LoadResult {
  const envelope = envelopeShapeSchema.safeParse(raw);
  if (!envelope.success) {
    return {
      ok: false,
      error: {
        kind: 'malformed-envelope',
        issues: envelope.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
      },
    };
  }

  const { schemaVersion, state: rawState } = envelope.data;

  const migration = runMigrations(MIGRATIONS, schemaVersion, SCHEMA_VERSION, rawState);
  if (!migration.ok) {
    return { ok: false, error: migration.failure };
  }

  const validated = parseGameState(migration.state);
  if (!validated.ok) {
    return { ok: false, error: { kind: 'invalid-state', issues: validated.issues } };
  }

  return { ok: true, state: validated.state, migrated: schemaVersion !== SCHEMA_VERSION };
}
