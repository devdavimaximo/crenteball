/**
 * Engine identity and versioning.
 *
 * `SCHEMA_VERSION` tracks the shape of `GameState` and is the number the save
 * migrations key off (see src/persistence/). Bump it whenever the state shape
 * changes; never for a UI change.
 */
export const GAME_NAME = 'Crenteball';

export const GAME_VERSION = '0.1.0';

export const SCHEMA_VERSION = 1;
