import { describe, expect, it } from 'vitest';

import { BRASIL_NAMES, LIGA_BRASIL } from '@/content';
import { toClub } from '@/engine/domain/club';

import { calendarRngFor, generateCalendar } from './calendar';
import { matchRngFor, simulateMatch } from './match';
import type { MatchResult, MatchTeam } from './match';
import { generateSquad, squadRngFor } from './squad';
import { buildTable, findRow, topScorers } from './table';

const SEED = 20260721;
const CLUB_IDS = LIGA_BRASIL.clubs.map((club) => club.id);

/** Handy shorthand for tests that care about the table, not the football. */
function result(
  homeClubId: string,
  homeGoals: number,
  awayClubId: string,
  awayGoals: number,
): MatchResult {
  return { homeClubId, awayClubId, homeGoals, awayGoals, goals: [] };
}

describe('buildTable — the basics', () => {
  it('lists clubs that have not played yet', () => {
    const table = buildTable([], ['a', 'b', 'c']);
    expect(table).toHaveLength(3);
    expect(table.every((row) => row.played === 0 && row.points === 0)).toBe(true);
  });

  it('awards three for a win and one each for a draw', () => {
    const table = buildTable([result('a', 2, 'b', 1), result('c', 1, 'd', 1)], [
      'a',
      'b',
      'c',
      'd',
    ]);

    expect(findRow(table, 'a')?.points).toBe(3);
    expect(findRow(table, 'b')?.points).toBe(0);
    expect(findRow(table, 'c')?.points).toBe(1);
    expect(findRow(table, 'd')?.points).toBe(1);
  });

  it('counts played, won, drawn, lost and goals from both sides', () => {
    const table = buildTable([result('a', 3, 'b', 1), result('b', 2, 'a', 2)], ['a', 'b']);

    const a = findRow(table, 'a');
    expect(a).toMatchObject({
      played: 2,
      won: 1,
      drawn: 1,
      lost: 0,
      goalsFor: 5,
      goalsAgainst: 3,
      goalDifference: 2,
      points: 4,
    });

    const b = findRow(table, 'b');
    expect(b).toMatchObject({ played: 2, won: 0, drawn: 1, lost: 1, goalsFor: 3, goalsAgainst: 5 });
  });

  it('numbers positions from one', () => {
    const table = buildTable([result('a', 5, 'b', 0)], ['a', 'b']);
    expect(table[0]?.position).toBe(1);
    expect(table[1]?.position).toBe(2);
  });
});

describe('tie-breaking, in order', () => {
  it('puts more points first', () => {
    const table = buildTable([result('a', 1, 'b', 0)], ['a', 'b']);
    expect(table[0]?.clubId).toBe('a');
  });

  it('breaks equal points by wins, not goal difference', () => {
    // `winner` takes 3 points from one win and two defeats; `drawer` takes 3
    // from three draws, with the better goal difference. Wins rank first, so
    // `winner` leads despite the worse difference.
    const results = [
      result('winner', 1, 'x', 0),
      result('winner', 0, 'y', 4),
      result('winner', 0, 'z', 1),

      result('drawer', 2, 'x', 2),
      result('drawer', 2, 'y', 2),
      result('drawer', 2, 'z', 2),
    ];

    const table = buildTable(results, ['winner', 'drawer']);

    expect(findRow(table, 'winner')?.points).toBe(findRow(table, 'drawer')?.points);
    expect(findRow(table, 'drawer')?.goalDifference).toBeGreaterThan(
      findRow(table, 'winner')?.goalDifference ?? 0,
    );

    // Compared against each other, not against the whole table: the opponents
    // in these fixtures collect points of their own.
    expect(table.findIndex((r) => r.clubId === 'winner')).toBeLessThan(
      table.findIndex((r) => r.clubId === 'drawer'),
    );
  });

  it('breaks equal points and wins by goal difference', () => {
    const results = [result('a', 4, 'x', 0), result('b', 1, 'y', 0)];
    const table = buildTable(results, ['a', 'b']);
    expect(table[0]?.clubId).toBe('a');
  });

  it('breaks equal difference by goals scored', () => {
    const results = [result('a', 3, 'x', 2), result('b', 1, 'y', 0)];
    const table = buildTable(results, ['a', 'b']);
    expect(findRow(table, 'a')?.goalDifference).toBe(findRow(table, 'b')?.goalDifference);
    expect(table[0]?.clubId).toBe('a');
  });

  it('falls back to the head-to-head result', () => {
    // zulu and alpha end up identical on points, wins, difference and goals.
    // zulu won the one match between them, so it must finish above alpha —
    // despite alpha winning the alphabetical last resort.
    const results = [
      result('zulu', 1, 'alpha', 0),
      result('filler-a', 1, 'zulu', 0),
      result('alpha', 1, 'filler-b', 0),
    ];

    const table = buildTable(results, ['alpha', 'zulu', 'filler-a', 'filler-b']);

    const zulu = findRow(table, 'zulu');
    const alpha = findRow(table, 'alpha');
    expect(zulu?.points).toBe(alpha?.points);
    expect(zulu?.won).toBe(alpha?.won);
    expect(zulu?.goalDifference).toBe(alpha?.goalDifference);
    expect(zulu?.goalsFor).toBe(alpha?.goalsFor);

    expect(table.findIndex((r) => r.clubId === 'zulu')).toBeLessThan(
      table.findIndex((r) => r.clubId === 'alpha'),
    );
  });

  it('orders two perfectly level clubs the same way regardless of input order', () => {
    // A win each, identical everything: the head-to-head cancels out and the
    // stable id ordering has to decide, the same way every time.
    const results = [result('alpha', 2, 'beta', 0), result('beta', 2, 'alpha', 0)];

    const forwards = buildTable(results, ['alpha', 'beta']);
    const backwards = buildTable([...results].reverse(), ['beta', 'alpha']);

    expect(forwards.map((r) => r.clubId)).toEqual(backwards.map((r) => r.clubId));
    expect(forwards[0]?.clubId).toBe('alpha');
  });

  it('never leaves the order to chance', () => {
    // Two clubs identical in every respect must always sort the same way,
    // otherwise the table reshuffles every time it is rendered.
    const ids = ['zeta', 'alpha'];
    const first = buildTable([], ids);
    const second = buildTable([], [...ids].reverse());
    expect(first.map((r) => r.clubId)).toEqual(second.map((r) => r.clubId));
    expect(first[0]?.clubId).toBe('alpha');
  });
});

describe('a full simulated season', () => {
  const teams: MatchTeam[] = LIGA_BRASIL.clubs.map((data) => {
    const club = toClub(data);
    return {
      clubId: club.id,
      squad: generateSquad(club, BRASIL_NAMES, squadRngFor(SEED, 1, club.id)),
    };
  });

  const byId = new Map(teams.map((team) => [team.clubId, team]));
  const calendar = generateCalendar(CLUB_IDS, calendarRngFor(SEED, 1, LIGA_BRASIL.id));

  const results = calendar.map((fixture) => {
    const home = byId.get(fixture.homeClubId);
    const away = byId.get(fixture.awayClubId);
    if (!home || !away) throw new Error('fixture aponta para clube inexistente');
    return simulateMatch(home, away, matchRngFor(SEED, 1, fixture.round, fixture.homeClubId));
  });

  const table = buildTable(results, CLUB_IDS);

  it('has every club playing 38 matches', () => {
    for (const row of table) {
      expect(row.played, row.clubId).toBe(38);
      expect(row.won + row.drawn + row.lost, row.clubId).toBe(38);
    }
  });

  it('balances goals scored against goals conceded across the league', () => {
    const scored = table.reduce((sum, row) => sum + row.goalsFor, 0);
    const conceded = table.reduce((sum, row) => sum + row.goalsAgainst, 0);
    expect(scored).toBe(conceded);
    expect(table.reduce((sum, row) => sum + row.goalDifference, 0)).toBe(0);
  });

  it('awards points consistent with results across the whole league', () => {
    const totalPoints = table.reduce((sum, row) => sum + row.points, 0);
    const draws = results.filter((r) => r.homeGoals === r.awayGoals).length;
    // Every decisive match puts 3 points into the league, every draw puts 2.
    expect(totalPoints).toBe((results.length - draws) * 3 + draws * 2);
  });

  it('produces a champion with a plausible points total', () => {
    const champion = table[0];
    expect(champion).toBeDefined();
    // Winning a 38-round league usually takes somewhere in the 70s or 80s.
    expect(champion?.points).toBeGreaterThan(60);
    expect(champion?.points).toBeLessThan(100);
  });

  it('separates the top from the bottom', () => {
    const first = table[0]?.points ?? 0;
    const last = table[table.length - 1]?.points ?? 0;
    expect(first - last).toBeGreaterThan(25);
  });

  it('is sorted by points, descending', () => {
    for (let i = 1; i < table.length; i += 1) {
      expect(table[i - 1]?.points).toBeGreaterThanOrEqual(table[i]?.points ?? 0);
    }
  });

  it('tends to reward the stronger clubs without guaranteeing it', () => {
    const reputationOf = (clubId: string) =>
      LIGA_BRASIL.clubs.find((club) => club.id === clubId)?.reputation ?? 0;

    const topFour = table.slice(0, 4);
    const averageTopReputation =
      topFour.reduce((sum, row) => sum + reputationOf(row.clubId), 0) / topFour.length;

    expect(averageTopReputation).toBeGreaterThan(65);
  });
});

describe('topScorers', () => {
  const withGoals = (
    entries: { playerId: string; playerName: string; clubId: string; count: number }[],
  ): MatchResult => ({
    homeClubId: 'a',
    awayClubId: 'b',
    homeGoals: 0,
    awayGoals: 0,
    goals: entries.flatMap((entry) =>
      Array.from({ length: entry.count }, (_, i) => ({
        clubId: entry.clubId,
        playerId: entry.playerId,
        playerName: entry.playerName,
        minute: i + 1,
      })),
    ),
  });

  it('ranks by goals scored', () => {
    const chart = topScorers([
      withGoals([
        { playerId: 'p1', playerName: 'Davi', clubId: 'a', count: 3 },
        { playerId: 'p2', playerName: 'Enzo', clubId: 'b', count: 7 },
      ]),
    ]);

    expect(chart[0]).toMatchObject({ position: 1, playerId: 'p2', goals: 7 });
    expect(chart[1]).toMatchObject({ position: 2, playerId: 'p1', goals: 3 });
  });

  it('accumulates a player’s goals across matches', () => {
    const chart = topScorers([
      withGoals([{ playerId: 'p1', playerName: 'Davi', clubId: 'a', count: 2 }]),
      withGoals([{ playerId: 'p1', playerName: 'Davi', clubId: 'a', count: 1 }]),
    ]);

    expect(chart[0]?.goals).toBe(3);
  });

  it('orders players level on goals deterministically', () => {
    const entries = [
      { playerId: 'p2', playerName: 'Zeca', clubId: 'b', count: 5 },
      { playerId: 'p1', playerName: 'Ana', clubId: 'a', count: 5 },
    ];
    expect(topScorers([withGoals(entries)])[0]?.playerName).toBe('Ana');
    expect(topScorers([withGoals([...entries].reverse())])[0]?.playerName).toBe('Ana');
  });

  it('honours a limit', () => {
    const chart = topScorers(
      [
        withGoals([
          { playerId: 'p1', playerName: 'A', clubId: 'a', count: 3 },
          { playerId: 'p2', playerName: 'B', clubId: 'b', count: 2 },
          { playerId: 'p3', playerName: 'C', clubId: 'c', count: 1 },
        ]),
      ],
      2,
    );
    expect(chart).toHaveLength(2);
  });

  it('returns nothing for a goalless set of results', () => {
    expect(topScorers([result('a', 0, 'b', 0)])).toEqual([]);
  });

  it('produces a plausible golden boot over a real season', () => {
    const teams: MatchTeam[] = LIGA_BRASIL.clubs.map((data) => {
      const club = toClub(data);
      return {
        clubId: club.id,
        squad: generateSquad(club, BRASIL_NAMES, squadRngFor(SEED, 1, club.id)),
      };
    });
    const byId = new Map(teams.map((team) => [team.clubId, team]));
    const calendar = generateCalendar(CLUB_IDS, calendarRngFor(SEED, 1, LIGA_BRASIL.id));

    const seasonResults = calendar.map((fixture) => {
      const home = byId.get(fixture.homeClubId);
      const away = byId.get(fixture.awayClubId);
      if (!home || !away) throw new Error('fixture inválido');
      return simulateMatch(home, away, matchRngFor(SEED, 1, fixture.round, fixture.homeClubId));
    });

    const chart = topScorers(seasonResults, 10);
    expect(chart).toHaveLength(10);

    // A 38-round league's top scorer usually lands somewhere in the 20s or 30s.
    const golden = chart[0]?.goals ?? 0;
    expect(golden).toBeGreaterThan(12);
    expect(golden).toBeLessThan(45);
  });
});
