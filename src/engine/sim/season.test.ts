import { describe, expect, it } from 'vitest';

import { BRASIL_NAMES, LIGA_BRASIL } from '@/content';

import { simulateSeason } from './season';

const SEED = 20260721;

function season(number_ = 1, seed = SEED) {
  return simulateSeason(LIGA_BRASIL, BRASIL_NAMES, seed, number_);
}

describe('simulateSeason', () => {
  it('plays every fixture in the calendar', () => {
    const result = season();
    expect(result.calendar).toHaveLength(380);
    expect(result.results).toHaveLength(380);
  });

  it('produces a complete table', () => {
    const result = season();
    expect(result.table).toHaveLength(20);
    expect(result.table.every((row) => row.played === 38)).toBe(true);
  });

  it('crowns exactly one champion', () => {
    const table = season().table;
    expect(table[0]?.position).toBe(1);
    expect(table.filter((row) => row.position === 1)).toHaveLength(1);
  });

  it('lists scorers', () => {
    const { scorers } = season();
    expect(scorers.length).toBeGreaterThan(50);
    expect(scorers[0]?.goals).toBeGreaterThan(10);
  });
});

describe('determinism', () => {
  it('replays a season identically', () => {
    expect(season(3)).toEqual(season(3));
  });

  it('can simulate season 7 without simulating 1 through 6 first', () => {
    const direct = season(7);
    season(1);
    season(2);
    expect(season(7)).toEqual(direct);
  });

  it('gives different seasons different outcomes', () => {
    expect(season(1).table[0]?.clubId).toBeDefined();
    expect(season(1).results).not.toEqual(season(2).results);
  });

  it('gives different careers different leagues', () => {
    expect(season(1, 111).results).not.toEqual(season(1, 222).results);
  });
});

describe('across many seasons', () => {
  const SEASONS = 15;
  const played = Array.from({ length: SEASONS }, (_, i) => season(i + 1));

  it('keeps points totals sane every single season', () => {
    for (const result of played) {
      const champion = result.table[0];
      const bottom = result.table[result.table.length - 1];
      expect(champion?.points, `temporada ${String(result.season)}`).toBeGreaterThan(55);
      expect(champion?.points, `temporada ${String(result.season)}`).toBeLessThan(100);
      expect(bottom?.points, `temporada ${String(result.season)}`).toBeLessThan(45);
    }
  });

  it('does not hand the title to the same club every year', () => {
    // A league with a permanent champion has no title race to care about.
    const champions = new Set(played.map((result) => result.table[0]?.clubId));
    expect(champions.size).toBeGreaterThan(1);
  });

  it('still favours the strong clubs over time', () => {
    const reputationOf = (clubId: string | undefined) =>
      LIGA_BRASIL.clubs.find((club) => club.id === clubId)?.reputation ?? 0;

    const averageChampionReputation =
      played.reduce((sum, result) => sum + reputationOf(result.table[0]?.clubId), 0) /
      played.length;

    expect(averageChampionReputation).toBeGreaterThan(70);
  });

  it('never lets the weakest club win the league', () => {
    const weakest = [...LIGA_BRASIL.clubs].sort((a, b) => a.reputation - b.reputation)[0];
    for (const result of played) {
      expect(result.table[0]?.clubId).not.toBe(weakest?.id);
    }
  });
});
