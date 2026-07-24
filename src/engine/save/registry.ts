/**
 * The real migration chain for Crenteball's save format.
 *
 * The rule: the day `SCHEMA_VERSION` (see engine/meta.ts) goes up, a migration
 * is added here, in the same task that changes `GameState`'s shape (CLAUDE.md
 * section 9). Never remove or edit an old entry afterwards — a player's save
 * from that version becomes permanently unloadable the moment its migration
 * disappears.
 *
 * Every migration in this file is written with **frozen literals**, never with
 * imported constants. A migration must produce the same output in five years'
 * time as it does today; if it read `FIRST_WAGE_BASE`, rebalancing that number
 * would silently rewrite the past of every old save that has yet to be opened.
 */
import type { Migration } from './migration';

/**
 * v1 → v2: careers gain a face, a club and a contract, and condition gains
 * form.
 *
 * v1 predates career mode entirely — those saves are fresh careers from the
 * prototype builds, with no club to preserve. They are adopted by the smallest
 * club in Liga Brasil on the terms that club offered when v2 shipped
 * (reputation 31: R$ 400 + R$ 20 × 31 = R$ 1.020 a week, in cents), which is
 * exactly what a career created on the same day would have got.
 *
 * `untilSeason` follows the save's own clock rather than a fixed 3, so a v1
 * career already past its third season does not load holding an expired deal.
 */
const V1_ADOPTING_CLUB = { leagueId: 'liga-brasil', clubId: 'sao-luis-maranhense' } as const;
const V1_ADOPTING_WAGE_CENTS = 102_000;
const V1_CONTRACT_SEASONS = 3;

const V1_DEFAULT_APPEARANCE = {
  skinTone: 2,
  hairStyle: 'short',
  hairColour: 0,
  beard: 'none',
  height: 1.8,
  build: 0.5,
} as const;

const V1_STARTING_FORM = 50;

interface V1State {
  readonly clock?: { readonly season?: number };
  readonly player?: { readonly condition?: object };
}

function migrateV1ToV2(state: unknown): unknown {
  const old = state as V1State;
  const season = old.clock?.season ?? 1;

  return {
    ...(old as object),
    player: {
      ...(old.player as object),
      appearance: V1_DEFAULT_APPEARANCE,
      condition: { ...(old.player?.condition as object), form: V1_STARTING_FORM },
    },
    contract: {
      ...V1_ADOPTING_CLUB,
      weeklyWage: V1_ADOPTING_WAGE_CENTS,
      untilSeason: season + V1_CONTRACT_SEASONS - 1,
    },
  };
}

export const MIGRATIONS: readonly Migration[] = [{ from: 1, migrate: migrateV1ToV2 }];
