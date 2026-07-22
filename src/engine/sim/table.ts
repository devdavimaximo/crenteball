/**
 * League table and scoring charts.
 *
 * Pure aggregation: hand it match results, get back a standings table and a
 * top-scorer list. It holds no state of its own, so the same results always
 * produce the same table — and a partially played season produces a partial
 * table without any special casing.
 */
import { POINTS_FOR_DRAW, POINTS_FOR_LOSS, POINTS_FOR_WIN } from '@/engine/balance/table';

import type { MatchResult } from './match';

export interface TableRow {
  /** 1-based, assigned after sorting. */
  readonly position: number;
  readonly clubId: string;
  readonly played: number;
  readonly won: number;
  readonly drawn: number;
  readonly lost: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly goalDifference: number;
  readonly points: number;
}

export interface ScorerRow {
  readonly position: number;
  readonly playerId: string;
  readonly playerName: string;
  readonly clubId: string;
  readonly goals: number;
}

interface Tally {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
}

function emptyTally(clubId: string): Tally {
  return { clubId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
}

function pointsOf(tally: Tally): number {
  return tally.won * POINTS_FOR_WIN + tally.drawn * POINTS_FOR_DRAW + tally.lost * POINTS_FOR_LOSS;
}

/**
 * Points and goal difference from matches between two clubs only.
 *
 * Applied pairwise during sorting. With three or more clubs level this is not
 * strictly transitive — real competitions handle that with a mini-league —
 * but the criteria above it separate all but a handful of cases, and the
 * final `clubId` comparison guarantees a stable order regardless.
 */
function headToHead(
  results: readonly MatchResult[],
  a: string,
  b: string,
): { aPoints: number; bPoints: number; aGoalDifference: number } {
  let aPoints = 0;
  let bPoints = 0;
  let aGoalDifference = 0;

  for (const result of results) {
    const involvesBoth =
      (result.homeClubId === a && result.awayClubId === b) ||
      (result.homeClubId === b && result.awayClubId === a);
    if (!involvesBoth) continue;

    const aIsHome = result.homeClubId === a;
    const aGoals = aIsHome ? result.homeGoals : result.awayGoals;
    const bGoals = aIsHome ? result.awayGoals : result.homeGoals;

    aGoalDifference += aGoals - bGoals;

    if (aGoals > bGoals) {
      aPoints += POINTS_FOR_WIN;
    } else if (aGoals < bGoals) {
      bPoints += POINTS_FOR_WIN;
    } else {
      aPoints += POINTS_FOR_DRAW;
      bPoints += POINTS_FOR_DRAW;
    }
  }

  return { aPoints, bPoints, aGoalDifference };
}

/**
 * Builds the standings.
 *
 * `clubIds` is required so clubs that have not played yet still appear — a
 * table that grows a row each round would be worse than useless in preseason.
 */
export function buildTable(
  results: readonly MatchResult[],
  clubIds: readonly string[],
): TableRow[] {
  const tallies = new Map<string, Tally>(clubIds.map((id) => [id, emptyTally(id)]));

  const tallyOf = (clubId: string): Tally => {
    const existing = tallies.get(clubId);
    if (existing) return existing;
    const fresh = emptyTally(clubId);
    tallies.set(clubId, fresh);
    return fresh;
  };

  for (const result of results) {
    const home = tallyOf(result.homeClubId);
    const away = tallyOf(result.awayClubId);

    home.played += 1;
    away.played += 1;
    home.goalsFor += result.homeGoals;
    home.goalsAgainst += result.awayGoals;
    away.goalsFor += result.awayGoals;
    away.goalsAgainst += result.homeGoals;

    if (result.homeGoals > result.awayGoals) {
      home.won += 1;
      away.lost += 1;
    } else if (result.homeGoals < result.awayGoals) {
      away.won += 1;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
    }
  }

  const sorted = [...tallies.values()].sort((a, b) => {
    const pointsGap = pointsOf(b) - pointsOf(a);
    if (pointsGap !== 0) return pointsGap;

    const winsGap = b.won - a.won;
    if (winsGap !== 0) return winsGap;

    const differenceGap =
      b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst);
    if (differenceGap !== 0) return differenceGap;

    const goalsGap = b.goalsFor - a.goalsFor;
    if (goalsGap !== 0) return goalsGap;

    const direct = headToHead(results, a.clubId, b.clubId);
    // Compare the two clubs' returns from those matches against each other —
    // one side's points alone say nothing, and using them made the order
    // depend on which club the sort happened to pass in first.
    if (direct.aPoints !== direct.bPoints) return direct.bPoints - direct.aPoints;
    if (direct.aGoalDifference !== 0) return -direct.aGoalDifference;

    // Deterministic last resort — never leave the order to the sort's whim.
    return a.clubId.localeCompare(b.clubId);
  });

  return sorted.map((tally, index) => ({
    position: index + 1,
    clubId: tally.clubId,
    played: tally.played,
    won: tally.won,
    drawn: tally.drawn,
    lost: tally.lost,
    goalsFor: tally.goalsFor,
    goalsAgainst: tally.goalsAgainst,
    goalDifference: tally.goalsFor - tally.goalsAgainst,
    points: pointsOf(tally),
  }));
}

/**
 * The scoring chart.
 *
 * `limit` defaults to everyone: a season summary wants the top ten, but the
 * player's own placing matters even when it is fortieth.
 */
export function topScorers(results: readonly MatchResult[], limit?: number): ScorerRow[] {
  const counts = new Map<string, { playerName: string; clubId: string; goals: number }>();

  for (const result of results) {
    for (const goal of result.goals) {
      const existing = counts.get(goal.playerId);
      if (existing) {
        existing.goals += 1;
      } else {
        counts.set(goal.playerId, {
          playerName: goal.playerName,
          clubId: goal.clubId,
          goals: 1,
        });
      }
    }
  }

  const sorted = [...counts.entries()]
    .map(([playerId, entry]) => ({ playerId, ...entry }))
    .sort((a, b) => {
      const goalsGap = b.goals - a.goals;
      if (goalsGap !== 0) return goalsGap;
      // Stable ordering for players level on goals.
      return a.playerName.localeCompare(b.playerName) || a.playerId.localeCompare(b.playerId);
    });

  const ranked = sorted.map((entry, index) => ({ position: index + 1, ...entry }));
  return limit === undefined ? ranked : ranked.slice(0, limit);
}

export function findRow(table: readonly TableRow[], clubId: string): TableRow | undefined {
  return table.find((row) => row.clubId === clubId);
}
