import { describe, expect, it } from 'vitest';

import { LIGA_BRASIL } from '@/content';
import {
  FIRST_CLUB_POOL,
  FIRST_WAGE_BASE,
  FIRST_WAGE_PER_REPUTATION,
  MAX_STARTING_ATTRIBUTE,
  STARTING_ATTRIBUTE,
  STARTING_ATTRIBUTE_POINTS,
} from '@/engine/balance/career';
import { DEFAULT_APPEARANCE } from '@/engine/domain/appearance';
import { ATTRIBUTE_KEYS, createAttributes } from '@/engine/domain/attributes';
import type { Attributes } from '@/engine/domain/attributes';
import { parseGameState } from '@/engine/domain/schema';
import { createRng } from '@/engine/rng';

import {
  eligibleFirstClubs,
  firstClubRngFor,
  firstWage,
  startCareer,
  validateStartingAttributes,
} from './career';

/** A legal creation spread: the base six plus exactly the points on offer. */
const LEGAL_SPREAD: Attributes = {
  finishing: STARTING_ATTRIBUTE + 15,
  passing: STARTING_ATTRIBUTE + 5,
  dribbling: STARTING_ATTRIBUTE + 5,
  pace: STARTING_ATTRIBUTE + 5,
  defending: STARTING_ATTRIBUTE,
  physical: STARTING_ATTRIBUTE,
};

const START = {
  seed: 20260721,
  name: 'Davi Máximo',
  position: 'FW',
  appearance: DEFAULT_APPEARANCE,
  createdAt: '2026-07-21T18:00:00.000Z',
  attributes: LEGAL_SPREAD,
} as const;

describe('the test spread itself', () => {
  it('spends exactly the points the balance file grants', () => {
    const spent = ATTRIBUTE_KEYS.reduce(
      (sum, key) => sum + LEGAL_SPREAD[key] - STARTING_ATTRIBUTE,
      0,
    );
    expect(spent).toBe(STARTING_ATTRIBUTE_POINTS);
  });
});

describe('eligibleFirstClubs', () => {
  it('offers only the weakest clubs in the league', () => {
    const pool = eligibleFirstClubs(LIGA_BRASIL);
    const strongest = Math.max(...pool.map((club) => club.reputation));
    const outside = LIGA_BRASIL.clubs
      .filter((club) => !pool.some((candidate) => candidate.id === club.id))
      .map((club) => club.reputation);

    expect(pool).toHaveLength(FIRST_CLUB_POOL);
    expect(Math.min(...outside)).toBeGreaterThanOrEqual(strongest);
  });

  it('does not depend on the order the content file lists clubs in', () => {
    const shuffled = { ...LIGA_BRASIL, clubs: [...LIGA_BRASIL.clubs].reverse() };
    expect(eligibleFirstClubs(shuffled)).toEqual(eligibleFirstClubs(LIGA_BRASIL));
  });
});

describe('firstWage', () => {
  it('pays more at a bigger club', () => {
    expect(firstWage(50)).toBeGreaterThan(firstWage(30));
  });

  it('is whole cents, never a float', () => {
    for (const reputation of [1, 31, 47, 88, 100]) {
      expect(Number.isInteger(firstWage(reputation)), String(reputation)).toBe(true);
    }
  });

  it('follows the balance constants', () => {
    expect(firstWage(31)).toBe(FIRST_WAGE_BASE + FIRST_WAGE_PER_REPUTATION * 31);
  });
});

describe('validateStartingAttributes', () => {
  it('accepts a spread that spends exactly the points on offer', () => {
    expect(validateStartingAttributes(LEGAL_SPREAD)).toEqual([]);
  });

  it('rejects spending too few or too many points', () => {
    const base = createAttributes(STARTING_ATTRIBUTE);
    expect(validateStartingAttributes(base)).toContainEqual({
      kind: 'wrong-total',
      spent: 0,
      allowed: STARTING_ATTRIBUTE_POINTS,
    });
  });

  it('rejects an attribute pushed below the base', () => {
    const attributes = { ...LEGAL_SPREAD, defending: STARTING_ATTRIBUTE - 5 };
    expect(validateStartingAttributes(attributes)).toContainEqual({
      kind: 'below-base',
      key: 'defending',
    });
  });

  it('rejects a one-attribute build', () => {
    const attributes = { ...createAttributes(STARTING_ATTRIBUTE), finishing: 99 };
    expect(validateStartingAttributes(attributes)).toContainEqual({
      kind: 'above-cap',
      key: 'finishing',
      cap: MAX_STARTING_ATTRIBUTE,
    });
  });
});

describe('startCareer', () => {
  it('is deterministic — the same seed always lands at the same club', () => {
    const a = startCareer(START, LIGA_BRASIL, firstClubRngFor(START.seed));
    const b = startCareer(START, LIGA_BRASIL, firstClubRngFor(START.seed));
    expect(a).toEqual(b);
  });

  it('signs him to one of the clubs that would have him', () => {
    const pool = eligibleFirstClubs(LIGA_BRASIL).map((club) => club.id);

    for (let seed = 1; seed <= 40; seed += 1) {
      const state = startCareer({ ...START, seed }, LIGA_BRASIL, firstClubRngFor(seed));
      expect(pool, `seed ${String(seed)}`).toContain(state.contract.clubId);
      expect(state.contract.leagueId).toBe(LIGA_BRASIL.id);
    }
  });

  it('does not always pick the same club across careers', () => {
    const clubs = new Set(
      Array.from({ length: 40 }, (_, i) =>
        startCareer({ ...START, seed: i + 1 }, LIGA_BRASIL, firstClubRngFor(i + 1)).contract.clubId,
      ),
    );
    expect(clubs.size).toBeGreaterThan(1);
  });

  it('pays the wage that club offers', () => {
    const state = startCareer(START, LIGA_BRASIL, createRng(7));
    const club = LIGA_BRASIL.clubs.find((candidate) => candidate.id === state.contract.clubId);
    expect(club).toBeDefined();
    expect(state.contract.weeklyWage).toBe(firstWage(club?.reputation ?? 0));
  });

  it('produces a state the domain schema accepts', () => {
    const state = startCareer(START, LIGA_BRASIL, firstClubRngFor(START.seed));
    const result = parseGameState(JSON.parse(JSON.stringify(state)));
    expect(result.ok, result.ok ? '' : result.issues.join('\n')).toBe(true);
  });

  it('keeps the face chosen at creation', () => {
    const appearance = { ...DEFAULT_APPEARANCE, hairStyle: 'afro', skinTone: 4 } as const;
    const state = startCareer({ ...START, appearance }, LIGA_BRASIL, createRng(1));
    expect(state.player.appearance).toEqual(appearance);
  });
});
