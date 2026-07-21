/**
 * The real migration chain for Crenteball's save format.
 *
 * Empty today: `SCHEMA_VERSION` (see engine/meta.ts) is 1, the first version
 * ever shipped, so there is nothing to migrate from yet.
 *
 * The rule going forward: the day `SCHEMA_VERSION` becomes 2, a migration
 * `{ from: 1, migrate }` is added here, in the same task that changes
 * `GameState`'s shape (see CLAUDE.md section 9). Never remove or edit an
 * old entry afterwards — a player's save from that version becomes
 * permanently unloadable the moment its migration disappears.
 */
import type { Migration } from './migration';

export const MIGRATIONS: readonly Migration[] = [];
