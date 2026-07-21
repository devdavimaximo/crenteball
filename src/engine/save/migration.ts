/**
 * The migration mechanism.
 *
 * Deliberately generic and separate from `registry.ts`: this file is what
 * makes "walk a save forward one schema version at a time" correct, and it is
 * tested with invented migrations, independent of whatever this game's real
 * schema history happens to be. `registry.ts` is the only file that changes
 * when `SCHEMA_VERSION` bumps.
 */
export interface Migration {
  /** The schemaVersion this migration accepts as input. */
  readonly from: number;
  /** Transforms state shaped for `from` into state shaped for `from + 1`. */
  migrate(state: unknown): unknown;
}

export type MigrationFailure =
  | {
      readonly kind: 'future-schema-version';
      readonly savedVersion: number;
      readonly supportedVersion: number;
    }
  | { readonly kind: 'missing-migration'; readonly version: number };

export type MigrationResult =
  | { readonly ok: true; readonly state: unknown }
  | { readonly ok: false; readonly failure: MigrationFailure };

/**
 * Walks `state` from `fromVersion` to `toVersion`, one migration at a time.
 *
 * A save from a schema newer than this build understands is rejected outright
 * — there is no such thing as migrating backwards. A save whose version has no
 * matching migration is also rejected, rather than silently passed through:
 * skipping a migration is how a save quietly ends up with the wrong shape.
 */
export function runMigrations(
  migrations: readonly Migration[],
  fromVersion: number,
  toVersion: number,
  state: unknown,
): MigrationResult {
  if (fromVersion > toVersion) {
    return {
      ok: false,
      failure: {
        kind: 'future-schema-version',
        savedVersion: fromVersion,
        supportedVersion: toVersion,
      },
    };
  }

  let version = fromVersion;
  let current = state;

  while (version < toVersion) {
    const migration = migrations.find((candidate) => candidate.from === version);
    if (!migration) {
      return { ok: false, failure: { kind: 'missing-migration', version } };
    }
    current = migration.migrate(current);
    version += 1;
  }

  return { ok: true, state: current };
}
