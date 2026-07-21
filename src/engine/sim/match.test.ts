import { describe, expect, it } from 'vitest';

import { BRASIL_NAMES, LIGA_BRASIL } from '@/content';
import {
  AWAY_ATTACK_MULTIPLIER,
  BASE_EXPECTED_GOALS,
  HOME_ATTACK_MULTIPLIER,
} from '@/engine/balance/match';
import { toClub } from '@/engine/domain/club';
import { createRng } from '@/engine/rng';

import { expectedGoals, matchRngFor, simulateMatch } from './match';
import type { MatchTeam } from './match';
import { generateSquad, squadRngFor, squadStrength } from './squad';

const SEED = 20260721;

/** Squads generated once and reused — 10k matches must stay fast. */
const TEAMS = new Map<string, MatchTeam>(
  LIGA_BRASIL.clubs.map((data) => {
    const club = toClub(data);
    return [
      club.shortName,
      {
        clubId: club.id,
        squad: generateSquad(club, BRASIL_NAMES, squadRngFor(SEED, 1, club.id)),
      },
    ];
  }),
);

function team(shortName: string): MatchTeam {
  const found = TEAMS.get(shortName);
  if (!found) throw new Error(`time ${shortName} não encontrado`);
  return found;
}

const BIG = team('AGU');
const SMALL = team('SLM');

/** Every fixture in the league, once each way — a realistic sample. */
function simulateManyMatches(count: number) {
  const rng = createRng(SEED);
  const teams = [...TEAMS.values()];
  const results = [];

  for (let i = 0; i < count; i += 1) {
    const home = teams[i % teams.length];
    const away = teams[(i * 7 + 3) % teams.length];
    if (!home || !away || home.clubId === away.clubId) continue;
    results.push(simulateMatch(home, away, rng));
  }

  return results;
}

describe('determinism', () => {
  it('replays the identical match from the same seed', () => {
    const a = simulateMatch(BIG, SMALL, matchRngFor(SEED, 1, 5, BIG.clubId));
    const b = simulateMatch(BIG, SMALL, matchRngFor(SEED, 1, 5, BIG.clubId));
    expect(a).toEqual(b);
  });

  it('gives different rounds different matches', () => {
    const a = simulateMatch(BIG, SMALL, matchRngFor(SEED, 1, 5, BIG.clubId));
    const b = simulateMatch(BIG, SMALL, matchRngFor(SEED, 1, 6, BIG.clubId));
    expect(a).not.toEqual(b);
  });
});

describe('result integrity', () => {
  it('records exactly one goal event per goal scored', () => {
    for (const result of simulateManyMatches(500)) {
      expect(result.goals).toHaveLength(result.homeGoals + result.awayGoals);
    }
  });

  it('attributes every goal to a player from the scoring club’s squad', () => {
    for (const result of simulateManyMatches(300)) {
      for (const goal of result.goals) {
        const scoringTeam = [...TEAMS.values()].find((t) => t.clubId === goal.clubId);
        expect(scoringTeam).toBeDefined();
        expect(scoringTeam?.squad.some((p) => p.id === goal.playerId)).toBe(true);
      }
    }
  });

  it('keeps goals inside the ninety minutes, in chronological order', () => {
    for (const result of simulateManyMatches(300)) {
      let previous = 0;
      for (const goal of result.goals) {
        expect(goal.minute).toBeGreaterThanOrEqual(1);
        expect(goal.minute).toBeLessThanOrEqual(90);
        expect(goal.minute).toBeGreaterThanOrEqual(previous);
        previous = goal.minute;
      }
    }
  });

  it('never produces a negative scoreline', () => {
    for (const result of simulateManyMatches(200)) {
      expect(result.homeGoals).toBeGreaterThanOrEqual(0);
      expect(result.awayGoals).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('the numbers look like football', () => {
  const SAMPLE = 10_000;

  it('averages a realistic number of goals per match', () => {
    const results = simulateManyMatches(SAMPLE);
    const total = results.reduce((sum, r) => sum + r.homeGoals + r.awayGoals, 0);
    const perMatch = total / results.length;

    // Real top divisions sit around 2.6-2.8.
    expect(perMatch).toBeGreaterThan(2.4);
    expect(perMatch).toBeLessThan(3.0);
  });

  it('gives home sides a real but beatable advantage', () => {
    const results = simulateManyMatches(SAMPLE);
    const homeWins = results.filter((r) => r.homeGoals > r.awayGoals).length;
    const awayWins = results.filter((r) => r.homeGoals < r.awayGoals).length;

    const homeRate = homeWins / results.length;
    expect(homeRate).toBeGreaterThan(0.38);
    expect(homeRate).toBeLessThan(0.55);
    expect(homeWins).toBeGreaterThan(awayWins);
  });

  it('draws a plausible share of matches', () => {
    const results = simulateManyMatches(SAMPLE);
    const draws = results.filter((r) => r.homeGoals === r.awayGoals).length;
    const rate = draws / results.length;

    expect(rate).toBeGreaterThan(0.15);
    expect(rate).toBeLessThan(0.32);
  });

  it('almost never produces an absurd scoreline', () => {
    const results = simulateManyMatches(SAMPLE);
    const absurd = results.filter((r) => r.homeGoals + r.awayGoals >= 10).length;

    // Poisson has a slightly fatter upper tail than real football does.
    // Accepted rather than patched — the alternative is a bespoke
    // distribution nobody can reason about, for an event a player meets once
    // every few seasons.
    expect(absurd / results.length).toBeLessThan(0.001);
  });

  it('keeps big scorelines rare enough to stay memorable', () => {
    const results = simulateManyMatches(SAMPLE);
    const sevenPlus = results.filter((r) => r.homeGoals + r.awayGoals >= 7).length;
    expect(sevenPlus / results.length).toBeLessThan(0.03);
  });

  it('lets strikers score far more than defenders', () => {
    const goals = simulateManyMatches(2000).flatMap((r) => r.goals);
    const byPosition = { GK: 0, DF: 0, MF: 0, FW: 0 };

    for (const goal of goals) {
      for (const t of TEAMS.values()) {
        const player = t.squad.find((p) => p.id === goal.playerId);
        if (player) {
          byPosition[player.position] += 1;
          break;
        }
      }
    }

    expect(byPosition.FW).toBeGreaterThan(byPosition.MF);
    expect(byPosition.MF).toBeGreaterThan(byPosition.DF);
    expect(byPosition.GK).toBe(0);
  });
});

describe('strength decides matches, but not every match', () => {
  it('makes the strongest club beat the weakest most of the time', () => {
    const rng = createRng(SEED);
    let bigWins = 0;
    const games = 1000;

    for (let i = 0; i < games; i += 1) {
      const result = simulateMatch(BIG, SMALL, rng);
      if (result.homeGoals > result.awayGoals) bigWins += 1;
    }

    expect(bigWins / games).toBeGreaterThan(0.6);
  });

  it('still lets the underdog win sometimes — otherwise a season has no story', () => {
    const rng = createRng(SEED);
    let upsets = 0;

    for (let i = 0; i < 1000; i += 1) {
      const result = simulateMatch(BIG, SMALL, rng);
      if (result.awayGoals > result.homeGoals) upsets += 1;
    }

    expect(upsets).toBeGreaterThan(20);
  });
});

describe('expectedGoals', () => {
  it('returns the base rate for evenly matched sides at a neutral venue', () => {
    // Reads the constant rather than hardcoding it: this asserts the model's
    // shape, and should not need editing every time the league is rebalanced.
    expect(expectedGoals(60, 60, 1)).toBeCloseTo(BASE_EXPECTED_GOALS, 5);
  });

  it('rewards the stronger side', () => {
    expect(expectedGoals(70, 45, 1)).toBeGreaterThan(expectedGoals(45, 70, 1));
  });

  it('favours the hosts', () => {
    expect(expectedGoals(60, 60, HOME_ATTACK_MULTIPLIER)).toBeGreaterThan(
      expectedGoals(60, 60, AWAY_ATTACK_MULTIPLIER),
    );
  });

  it('clamps an extreme mismatch instead of predicting a cricket score', () => {
    expect(expectedGoals(99, 1, 1)).toBeLessThanOrEqual(4.2);
    expect(expectedGoals(1, 99, 1)).toBeGreaterThanOrEqual(0.15);
  });

  it('tracks the strength gap the squads actually produce', () => {
    const gap = squadStrength(BIG.squad) - squadStrength(SMALL.squad);
    expect(gap).toBeGreaterThan(15);
  });
});
