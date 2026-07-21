import { describe, expect, it } from 'vitest';

import { BRASIL_NAMES, LIGA_BRASIL } from '@/content';
import { SQUAD_COMPOSITION, SQUAD_SIZE } from '@/engine/balance/squad';
import { ATTRIBUTE_KEYS, ATTRIBUTE_MAX, ATTRIBUTE_MIN, overall } from '@/engine/domain/attributes';
import { toClub } from '@/engine/domain/club';
import { POSITIONS } from '@/engine/domain/state';

import { generateSquad, maturityAt, skillForReputation, squadRngFor, squadStrength } from './squad';

const SEED = 20260721;

function clubByShortName(shortName: string) {
  const data = LIGA_BRASIL.clubs.find((club) => club.shortName === shortName);
  if (!data) throw new Error(`clube ${shortName} não existe no conteúdo`);
  return toClub(data);
}

const BIG = clubByShortName('AGU'); // reputação 88
const SMALL = clubByShortName('SLM'); // reputação 31

function squadFor(club = BIG, season = 1) {
  return generateSquad(club, BRASIL_NAMES, squadRngFor(SEED, season, club.id));
}

describe('squad composition', () => {
  it('fields a full squad', () => {
    expect(squadFor()).toHaveLength(SQUAD_SIZE);
  });

  it('covers every position in the configured numbers', () => {
    const squad = squadFor();
    for (const position of POSITIONS) {
      const count = squad.filter((player) => player.position === position).length;
      expect(count, position).toBe(SQUAD_COMPOSITION[position]);
    }
  });

  it('gives every player a unique id', () => {
    const ids = squadFor().map((player) => player.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('determinism — squads are derived, never stored', () => {
  it('regenerates the identical squad from the same seed, season and club', () => {
    expect(squadFor(BIG, 3)).toEqual(squadFor(BIG, 3));
  });

  it('gives different clubs different squads', () => {
    expect(squadFor(BIG, 1)).not.toEqual(squadFor(SMALL, 1));
  });

  it('refreshes the squad between seasons', () => {
    expect(squadFor(BIG, 1)).not.toEqual(squadFor(BIG, 2));
  });

  it('is independent of the order clubs are generated in', () => {
    // Looking at another club first must not shift this one — the property
    // that makes a whole league reproducible.
    const direct = squadFor(SMALL, 1);
    squadFor(BIG, 1);
    expect(squadFor(SMALL, 1)).toEqual(direct);
  });
});

describe('quality follows reputation', () => {
  it('makes a big club clearly stronger than a small one', () => {
    expect(squadStrength(squadFor(BIG))).toBeGreaterThan(squadStrength(squadFor(SMALL)));
  });

  it('keeps even the weakest club professional, not amateur', () => {
    // A flat proportional mapping would put reputation 31 near 17 overall,
    // which reads as a pub team rather than a struggling professional side.
    expect(squadStrength(squadFor(SMALL))).toBeGreaterThan(35);
  });

  it('orders the whole league roughly by reputation', () => {
    const strengths = LIGA_BRASIL.clubs.map((data) => {
      const club = toClub(data);
      return {
        reputation: club.reputation,
        strength: squadStrength(generateSquad(club, BRASIL_NAMES, squadRngFor(SEED, 1, club.id))),
      };
    });

    const byStrength = [...strengths].sort((a, b) => b.strength - a.strength);
    const topFive = byStrength.slice(0, 5);
    // Noise is intentional — an upset should be possible — but the five
    // strongest squads should all come from the upper half of the league.
    for (const entry of topFive) {
      expect(entry.reputation).toBeGreaterThan(60);
    }
  });

  it('maps reputation onto skill monotonically', () => {
    expect(skillForReputation(88)).toBeGreaterThan(skillForReputation(31));
  });
});

describe('players are plausible', () => {
  it('keeps every attribute inside the legal range', () => {
    for (const player of squadFor()) {
      for (const key of ATTRIBUTE_KEYS) {
        expect(player.attributes[key], `${player.name} ${key}`).toBeGreaterThanOrEqual(
          ATTRIBUTE_MIN,
        );
        expect(player.attributes[key], `${player.name} ${key}`).toBeLessThanOrEqual(ATTRIBUTE_MAX);
      }
    }
  });

  it('keeps ages within a professional career span', () => {
    for (const player of squadFor()) {
      expect(player.age).toBeGreaterThanOrEqual(17);
      expect(player.age).toBeLessThanOrEqual(38);
    }
  });

  it('never gives a player potential below his current ability', () => {
    for (const player of squadFor()) {
      expect(player.potential).toBeGreaterThanOrEqual(overall(player.attributes));
    }
  });

  it('does not make teenagers as good as players in their prime', () => {
    // The bug this guards against: age and ability rolled independently, so a
    // 17-year-old was his club's best player about as often as a 27-year-old.
    // Squad lists looked broken at a glance even though every test was green.
    const players = LIGA_BRASIL.clubs.flatMap((data) => {
      const club = toClub(data);
      return generateSquad(club, BRASIL_NAMES, squadRngFor(SEED, 1, club.id));
    });

    const meanOverall = (min: number, max: number) => {
      const group = players.filter((p) => p.age >= min && p.age <= max);
      expect(group.length, `sem jogadores entre ${String(min)} e ${String(max)}`).toBeGreaterThan(5);
      return group.reduce((sum, p) => sum + overall(p.attributes), 0) / group.length;
    };

    expect(meanOverall(17, 19)).toBeLessThan(meanOverall(25, 29));
  });

  it('rarely lets a teenager be his club’s best player', () => {
    const teenageStars = LIGA_BRASIL.clubs.filter((data) => {
      const club = toClub(data);
      const squad = generateSquad(club, BRASIL_NAMES, squadRngFor(SEED, 1, club.id));
      const best = [...squad].sort((a, b) => overall(b.attributes) - overall(a.attributes))[0];
      return best !== undefined && best.age <= 19;
    });

    // A wonderkid should be a story, not a weekly occurrence.
    expect(teenageStars.length).toBeLessThanOrEqual(2);
  });

  it('re-centres peak ability so squads still match their reputation', () => {
    // MEAN_MATURITY is a constant that must track the age distribution. If
    // either drifts, squads silently get weaker or stronger than intended.
    const agu = clubByShortName('AGU');
    const strength = squadStrength(
      generateSquad(agu, BRASIL_NAMES, squadRngFor(SEED, 1, agu.id)),
    );
    const target = skillForReputation(agu.reputation);
    expect(Math.abs(strength - target)).toBeLessThan(8);
  });

  it('leaves teenagers more room to grow than veterans', () => {
    // Sampled across the league so the comparison is not one lucky squad.
    const players = LIGA_BRASIL.clubs.flatMap((data) => {
      const club = toClub(data);
      return generateSquad(club, BRASIL_NAMES, squadRngFor(SEED, 1, club.id));
    });

    const room = (min: number, max: number) => {
      const group = players.filter((p) => p.age >= min && p.age <= max);
      const total = group.reduce((sum, p) => sum + (p.potential - overall(p.attributes)), 0);
      return total / group.length;
    };

    expect(room(17, 21)).toBeGreaterThan(room(30, 38));
  });

  it('shapes attributes to position — strikers finish, defenders defend', () => {
    const squad = squadFor();
    const mean = (position: string, key: 'finishing' | 'defending') => {
      const group = squad.filter((p) => p.position === position);
      return group.reduce((sum, p) => sum + p.attributes[key], 0) / group.length;
    };

    expect(mean('FW', 'finishing')).toBeGreaterThan(mean('DF', 'finishing'));
    expect(mean('DF', 'defending')).toBeGreaterThan(mean('FW', 'defending'));
  });

  it('draws names from the pool', () => {
    for (const player of squadFor()) {
      const [given, ...rest] = player.name.split(' ');
      expect(BRASIL_NAMES.given).toContain(given);
      expect(BRASIL_NAMES.surnames).toContain(rest.join(' '));
    }
  });

  it('does not fill a squad with the same handful of names', () => {
    const names = squadFor().map((player) => player.name);
    expect(new Set(names).size).toBeGreaterThanOrEqual(SQUAD_SIZE - 1);
  });
});

describe('maturityAt', () => {
  it('peaks at the peak age', () => {
    expect(maturityAt(27)).toBe(1);
  });

  it('rises through the developing years', () => {
    expect(maturityAt(17)).toBeLessThan(maturityAt(21));
    expect(maturityAt(21)).toBeLessThan(maturityAt(25));
  });

  it('declines after the peak, but gently', () => {
    expect(maturityAt(33)).toBeLessThan(1);
    expect(maturityAt(33)).toBeGreaterThan(0.9);
    expect(maturityAt(38)).toBeLessThan(maturityAt(33));
  });

  it('never collapses to nothing, however old', () => {
    expect(maturityAt(45)).toBeGreaterThan(0.5);
  });
});

describe('squadStrength', () => {
  it('weighs the best eleven above the bench', () => {
    const squad = squadFor();
    const ratings = squad.map((p) => overall(p.attributes)).sort((a, b) => b - a);
    const plainAverage = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;

    // Starter-weighted strength must sit above the flat average, since the
    // best players count for more.
    expect(squadStrength(squad)).toBeGreaterThan(plainAverage);
  });

  it('returns zero for an empty squad instead of NaN', () => {
    expect(squadStrength([])).toBe(0);
  });
});
