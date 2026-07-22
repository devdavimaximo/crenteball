/**
 * Runs a whole season of a league the player is not in.
 *
 * Assembles the pieces — squads, calendar, matches, table — into the one call
 * everything else needs. Before this existed the assembly was duplicated in
 * every test and would have been duplicated again in the balance harness.
 *
 * Entirely derived from (seed, season): no state carried in, none left
 * behind. Simulating season 7 does not require having simulated seasons 1-6.
 */
import type { LeagueData, NamePool } from '@/content/schema';
import { toClub } from '@/engine/domain/club';
import type { Seed } from '@/engine/rng';

import type { Calendar } from './calendar';
import { calendarRngFor, generateCalendar } from './calendar';
import { matchRngFor, simulateMatch } from './match';
import type { MatchResult, MatchTeam } from './match';
import { generateSquad, squadRngFor, squadStrength } from './squad';
import type { ScorerRow, TableRow } from './table';
import { buildTable, topScorers } from './table';

export interface SeasonResult {
  readonly season: number;
  readonly leagueId: string;
  readonly calendar: Calendar;
  readonly results: readonly MatchResult[];
  readonly table: readonly TableRow[];
  readonly scorers: readonly ScorerRow[];
}

/** Builds every club's squad for a season. */
export function buildTeams(league: LeagueData, names: NamePool, seed: Seed, season: number) {
  return league.clubs.map((data) => {
    const club = toClub(data);
    return {
      club,
      team: {
        clubId: club.id,
        squad: generateSquad(club, names, squadRngFor(seed, season, club.id)),
      } satisfies MatchTeam,
    };
  });
}

export function simulateSeason(
  league: LeagueData,
  names: NamePool,
  seed: Seed,
  season: number,
): SeasonResult {
  const teams = buildTeams(league, names, seed, season);
  const byId = new Map(teams.map((entry) => [entry.club.id, entry.team]));
  const clubIds = teams.map((entry) => entry.club.id);

  const calendar = generateCalendar(clubIds, calendarRngFor(seed, season, league.id));

  const results = calendar.map((fixture) => {
    const home = byId.get(fixture.homeClubId);
    const away = byId.get(fixture.awayClubId);
    if (!home || !away) {
      throw new Error(`calendário aponta para clube inexistente: ${fixture.homeClubId}`);
    }
    return simulateMatch(home, away, matchRngFor(seed, season, fixture.round, fixture.homeClubId));
  });

  return {
    season,
    leagueId: league.id,
    calendar,
    results,
    table: buildTable(results, clubIds),
    scorers: topScorers(results),
  };
}

/** Squad strength per club, for balance reporting. */
export function seasonStrengths(
  league: LeagueData,
  names: NamePool,
  seed: Seed,
  season: number,
): Map<string, number> {
  return new Map(
    buildTeams(league, names, seed, season).map((entry) => [
      entry.club.id,
      squadStrength(entry.team.squad),
    ]),
  );
}
