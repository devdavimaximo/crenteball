import { describe, expect, it } from 'vitest';

import { LIGA_BRASIL } from '@/content';
import { createRng } from '@/engine/rng';

import {
  calendarRngFor,
  fixtureForClubInRound,
  fixturesForClub,
  fixturesInRound,
  generateCalendar,
  isHome,
  matchesPerRound,
  opponentOf,
  roundsFor,
} from './calendar';
import type { Calendar } from './calendar';

const SEED = 20260721;
const CLUB_IDS = LIGA_BRASIL.clubs.map((club) => club.id);

function calendarFor(clubIds: readonly string[] = CLUB_IDS, season = 1): Calendar {
  return generateCalendar(clubIds, calendarRngFor(SEED, season, LIGA_BRASIL.id));
}

describe('shape', () => {
  it('schedules a double round-robin — 38 rounds for 20 clubs', () => {
    expect(roundsFor(20)).toBe(38);
    expect(matchesPerRound(20)).toBe(10);
  });

  it('produces every match exactly once', () => {
    const calendar = calendarFor();
    // 20 clubs, each plays 19 opponents twice = 380 matches.
    expect(calendar).toHaveLength(380);
  });

  it('plays every round with every club involved exactly once', () => {
    const calendar = calendarFor();

    for (let round = 1; round <= roundsFor(CLUB_IDS.length); round += 1) {
      const fixtures = fixturesInRound(calendar, round);
      expect(fixtures, `rodada ${String(round)}`).toHaveLength(10);

      const involved = fixtures.flatMap((f) => [f.homeClubId, f.awayClubId]);
      expect(new Set(involved).size, `rodada ${String(round)} tem clube repetido`).toBe(20);
    }
  });

  it('never schedules a club against itself', () => {
    for (const fixture of calendarFor()) {
      expect(fixture.homeClubId).not.toBe(fixture.awayClubId);
    }
  });
});

describe('every pairing happens home and away', () => {
  it('pairs each club with every other exactly twice, once at each ground', () => {
    const calendar = calendarFor();

    for (const home of CLUB_IDS) {
      for (const away of CLUB_IDS) {
        if (home === away) continue;

        const matches = calendar.filter(
          (f) => f.homeClubId === home && f.awayClubId === away,
        );
        expect(matches, `${home} x ${away}`).toHaveLength(1);
      }
    }
  });

  it('gives every club the same number of matches', () => {
    const calendar = calendarFor();
    for (const clubId of CLUB_IDS) {
      expect(fixturesForClub(calendar, clubId), clubId).toHaveLength(38);
    }
  });

  it('balances home and away exactly, thanks to the mirrored second half', () => {
    const calendar = calendarFor();

    for (const clubId of CLUB_IDS) {
      const fixtures = fixturesForClub(calendar, clubId);
      const home = fixtures.filter((f) => isHome(f, clubId)).length;
      expect(home, `${clubId} joga ${String(home)} em casa`).toBe(19);
    }
  });
});

describe('rhythm', () => {
  it('does not make a club host too many matches in a row', () => {
    const calendar = calendarFor();

    for (const clubId of CLUB_IDS) {
      const sequence = fixturesForClub(calendar, clubId)
        .sort((a, b) => a.round - b.round)
        .map((f) => (isHome(f, clubId) ? 'C' : 'F'));

      let longest = 1;
      let current = 1;
      for (let i = 1; i < sequence.length; i += 1) {
        current = sequence[i] === sequence[i - 1] ? current + 1 : 1;
        longest = Math.max(longest, current);
      }

      // A run of four or more identical venues in a row reads as a scheduling
      // bug to anyone looking at their fixture list.
      expect(longest, `${clubId}: ${sequence.join('')}`).toBeLessThanOrEqual(3);
    }
  });

  it('gives every first-half match a return leg with venues swapped', () => {
    const calendar = calendarFor();
    const first = calendar.filter((f) => f.round <= 19);
    const second = calendar.filter((f) => f.round > 19);

    expect(first).toHaveLength(190);
    expect(second).toHaveLength(190);

    for (const fixture of first) {
      const reverse = second.find(
        (f) => f.homeClubId === fixture.awayClubId && f.awayClubId === fixture.homeClubId,
      );
      expect(
        reverse,
        `sem returno para ${fixture.homeClubId} x ${fixture.awayClubId}`,
      ).toBeDefined();
    }
  });

  it('does not replay the first half in the same order', () => {
    const calendar = calendarFor();

    const sameOrder = calendar
      .filter((f) => f.round <= 19)
      .every((fixture) =>
        calendar.some(
          (f) =>
            f.round === fixture.round + 19 &&
            f.homeClubId === fixture.awayClubId &&
            f.awayClubId === fixture.homeClubId,
        ),
      );

    expect(sameOrder).toBe(false);
  });
});

describe('determinism', () => {
  it('rebuilds the identical calendar from the same seed and season', () => {
    expect(calendarFor(CLUB_IDS, 4)).toEqual(calendarFor(CLUB_IDS, 4));
  });

  it('varies between seasons', () => {
    expect(calendarFor(CLUB_IDS, 1)).not.toEqual(calendarFor(CLUB_IDS, 2));
  });

  it('varies between careers, so two players do not live the same season', () => {
    const a = generateCalendar(CLUB_IDS, createRng(1));
    const b = generateCalendar(CLUB_IDS, createRng(2));
    expect(a).not.toEqual(b);
  });
});

describe('rejections', () => {
  it('refuses an odd number of clubs', () => {
    expect(() => generateCalendar(CLUB_IDS.slice(0, 19), createRng(SEED))).toThrow(RangeError);
  });

  it('refuses a league too small to play', () => {
    expect(() => generateCalendar(['solitario'], createRng(SEED))).toThrow(RangeError);
  });
});

describe('smaller leagues', () => {
  it('works for a four-club league', () => {
    const clubs = ['a', 'b', 'c', 'd'];
    const calendar = generateCalendar(clubs, createRng(SEED));

    expect(calendar).toHaveLength(12);
    expect(roundsFor(4)).toBe(6);
    for (const clubId of clubs) {
      const fixtures = fixturesForClub(calendar, clubId);
      expect(fixtures).toHaveLength(6);
      expect(fixtures.filter((f) => isHome(f, clubId))).toHaveLength(3);
    }
  });

  it('works for a sixteen-club league, if the content ever changes size', () => {
    const clubs = Array.from({ length: 16 }, (_, i) => `club-${String(i)}`);
    const calendar = generateCalendar(clubs, createRng(SEED));
    expect(calendar).toHaveLength(240);
    expect(roundsFor(16)).toBe(30);
  });
});

describe('lookups', () => {
  it('finds a club’s match in a round', () => {
    const calendar = calendarFor();
    const clubId = CLUB_IDS[0] as string;

    const fixture = fixtureForClubInRound(calendar, clubId, 7);
    expect(fixture).toBeDefined();
    if (fixture) {
      expect(fixture.round).toBe(7);
      expect(opponentOf(fixture, clubId)).not.toBe(clubId);
      expect(CLUB_IDS).toContain(opponentOf(fixture, clubId));
    }
  });

  it('returns undefined for a round that does not exist', () => {
    expect(fixtureForClubInRound(calendarFor(), CLUB_IDS[0] as string, 99)).toBeUndefined();
  });
});
