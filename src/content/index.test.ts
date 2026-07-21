import { describe, expect, it } from 'vitest';

import { BRASIL_NAMES, findClub, findLeague, LEAGUES, LIGA_BRASIL } from './index';
import { leagueDataSchema } from './schema';

describe('shipped league data', () => {
  it('loads and validates without throwing', () => {
    expect(LIGA_BRASIL.id).toBe('liga-brasil');
    expect(LIGA_BRASIL.clubs.length).toBeGreaterThanOrEqual(16);
  });

  it('has an even number of clubs, so no club sits out a round', () => {
    for (const league of LEAGUES) {
      expect(league.clubs.length % 2, league.id).toBe(0);
    }
  });

  it('has unique club ids and short names', () => {
    const ids = LIGA_BRASIL.clubs.map((club) => club.id);
    const shortNames = LIGA_BRASIL.clubs.map((club) => club.shortName);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(shortNames).size).toBe(shortNames.length);
  });

  it('spreads reputation across a wide range, so the league is not flat', () => {
    const reputations = LIGA_BRASIL.clubs.map((club) => club.reputation);
    const spread = Math.max(...reputations) - Math.min(...reputations);
    // A league where every club is equally strong has no promotion story and
    // no "signing for a big club" moment.
    expect(spread).toBeGreaterThanOrEqual(40);
  });

  it('keeps budget broadly in line with reputation', () => {
    const sorted = [...LIGA_BRASIL.clubs].sort((a, b) => b.reputation - a.reputation);
    const richest = sorted[0];
    const poorest = sorted[sorted.length - 1];
    expect(richest).toBeDefined();
    expect(poorest).toBeDefined();
    if (richest && poorest) {
      expect(richest.budget).toBeGreaterThan(poorest.budget);
    }
  });
});

describe('league schema rejections', () => {
  it('rejects an odd number of clubs', () => {
    const odd = { ...LIGA_BRASIL, clubs: LIGA_BRASIL.clubs.slice(0, 19) };
    const result = leagueDataSchema.safeParse(odd);
    expect(result.success).toBe(false);
  });

  it('rejects duplicate club ids', () => {
    const first = LIGA_BRASIL.clubs[0];
    expect(first).toBeDefined();
    if (!first) return;
    const duplicated = {
      ...LIGA_BRASIL,
      clubs: [...LIGA_BRASIL.clubs.slice(0, 19), { ...first, shortName: 'ZZZ' }],
    };
    expect(leagueDataSchema.safeParse(duplicated).success).toBe(false);
  });

  it('rejects a non-hex colour', () => {
    const first = LIGA_BRASIL.clubs[0];
    expect(first).toBeDefined();
    if (!first) return;
    const broken = {
      ...LIGA_BRASIL,
      clubs: [
        { ...first, colours: { primary: 'vermelho', secondary: '#000000' } },
        ...LIGA_BRASIL.clubs.slice(1),
      ],
    };
    expect(leagueDataSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects an id that is not kebab-case, since ids live inside saves', () => {
    const first = LIGA_BRASIL.clubs[0];
    expect(first).toBeDefined();
    if (!first) return;
    const broken = {
      ...LIGA_BRASIL,
      clubs: [{ ...first, id: 'Atlético Guanabara' }, ...LIGA_BRASIL.clubs.slice(1)],
    };
    expect(leagueDataSchema.safeParse(broken).success).toBe(false);
  });
});

describe('name pool', () => {
  it('loads and validates', () => {
    expect(BRASIL_NAMES.given.length).toBeGreaterThanOrEqual(20);
    expect(BRASIL_NAMES.surnames.length).toBeGreaterThanOrEqual(20);
  });

  it('offers enough combinations to fill several leagues without repeats', () => {
    const combinations = BRASIL_NAMES.given.length * BRASIL_NAMES.surnames.length;
    expect(combinations).toBeGreaterThan(2000);
  });

  it('has no duplicate entries', () => {
    expect(new Set(BRASIL_NAMES.given).size).toBe(BRASIL_NAMES.given.length);
    expect(new Set(BRASIL_NAMES.surnames).size).toBe(BRASIL_NAMES.surnames.length);
  });
});

describe('lookups', () => {
  it('finds a league by id', () => {
    expect(findLeague('liga-brasil')?.name).toBe('Liga Brasil');
    expect(findLeague('inexistente')).toBeUndefined();
  });

  it('finds a club by id', () => {
    expect(findClub(LIGA_BRASIL, 'amazonia-fc')?.city).toBe('Manaus');
    expect(findClub(LIGA_BRASIL, 'inexistente')).toBeUndefined();
  });
});
