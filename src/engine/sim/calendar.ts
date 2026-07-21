/**
 * Season calendar: a double round-robin.
 *
 * Like squads, the calendar is **derived, not stored**: it is a pure function
 * of (career seed, season, league), so the same season always produces the
 * same fixture list and the save stays free of 380 scheduled matches.
 *
 * Built with the circle method: fix one club, rotate the rest around it. Each
 * rotation is one round in which every club plays exactly once.
 */
import type { Rng, Seed } from '@/engine/rng';
import { createRng, deriveSeed } from '@/engine/rng';

/** One scheduled match. `round` is 1-based, matching how a table is read. */
export interface Fixture {
  readonly round: number;
  readonly homeClubId: string;
  readonly awayClubId: string;
}

export type Calendar = readonly Fixture[];

/** A double round-robin: everyone plays everyone home and away. */
export function roundsFor(clubCount: number): number {
  return (clubCount - 1) * 2;
}

export function matchesPerRound(clubCount: number): number {
  return clubCount / 2;
}

/**
 * Builds the season's fixture list.
 *
 * The club order is shuffled first, so two careers with different seeds do
 * not face the same opponents on the same weeks — otherwise every player's
 * season would have an identical rhythm.
 */
export function generateCalendar(clubIds: readonly string[], rng: Rng): Calendar {
  if (clubIds.length < 2) {
    throw new RangeError(`uma liga precisa de ao menos 2 clubes, recebeu ${String(clubIds.length)}`);
  }
  if (clubIds.length % 2 !== 0) {
    throw new RangeError(
      `número ímpar de clubes (${String(clubIds.length)}): alguém ficaria de fora toda rodada`,
    );
  }

  const clubs = rng.shuffle(clubIds);
  const roundsInHalf = clubs.length - 1;

  const states = new Map<string, VenueState>();

  const pairings = buildPairings(clubs);
  const firstHalf = assignVenues(pairings, states, rng);

  // The second half mirrors the first with venues swapped, which is what
  // guarantees every club ends the season with exactly as many home matches
  // as away ones. Only the *order* of those rounds is still free — so it is
  // chosen to keep home and away runs short, continuing from where the first
  // half left each club.
  const mirrored: Fixture[][] = Array.from({ length: roundsInHalf }, (_, index) =>
    firstHalf
      .filter((fixture) => fixture.round === index + 1)
      .map((fixture) => ({
        round: 0, // assigned when the round is placed
        homeClubId: fixture.awayClubId,
        awayClubId: fixture.homeClubId,
      })),
  );

  const secondHalf = orderRounds(mirrored, roundsInHalf, states, rng);

  return [...firstHalf, ...secondHalf];
}

/** Unordered pairings per round, via the circle method. No venues yet. */
function buildPairings(clubs: readonly string[]): (readonly [string, string])[][] {
  const count = clubs.length;
  const half = count / 2;
  const rounds: (readonly [string, string])[][] = [];

  // clubs[0] stays put; the others rotate one place per round.
  const rotating = clubs.slice(1);

  for (let round = 0; round < count - 1; round += 1) {
    const lineup = [clubs[0] as string, ...rotating];
    const pairs: (readonly [string, string])[] = [];

    for (let i = 0; i < half; i += 1) {
      pairs.push([lineup[i] as string, lineup[count - 1 - i] as string] as const);
    }

    rounds.push(pairs);
    rotating.unshift(rotating.pop() as string);
  }

  return rounds;
}

interface VenueState {
  last: 'H' | 'A' | null;
  streak: number;
  home: number;
  away: number;
}

/**
 * Cost of sending a club to a given venue next.
 *
 * Extending an existing run is penalised quadratically, so a third
 * consecutive home match costs far more than a second. A milder term pushes
 * back against a club drifting away from an even home/away split within the
 * half.
 */
function venueCost(state: VenueState, venue: 'H' | 'A'): number {
  const streakPenalty = state.last === venue ? state.streak * state.streak * 10 : 0;
  const balancePenalty =
    venue === 'H' ? Math.max(0, state.home - state.away) : Math.max(0, state.away - state.home);
  return streakPenalty + balancePenalty;
}

function applyVenue(state: VenueState, venue: 'H' | 'A'): void {
  state.streak = state.last === venue ? state.streak + 1 : 1;
  state.last = venue;
  if (venue === 'H') state.home += 1;
  else state.away += 1;
}

/**
 * Decides who hosts each pairing.
 *
 * Kept separate from pairing on purpose: deriving the venue from a club's
 * position in the rotation looks reasonable and is not — a club holds the
 * same side of the circle for many rounds running, which produced a real
 * 19-match home run before this pass existed.
 */
function stateOf(states: Map<string, VenueState>, clubId: string): VenueState {
  const existing = states.get(clubId);
  if (existing) return existing;
  const fresh: VenueState = { last: null, streak: 0, home: 0, away: 0 };
  states.set(clubId, fresh);
  return fresh;
}

function assignVenues(
  rounds: (readonly [string, string])[][],
  states: Map<string, VenueState>,
  rng: Rng,
): Fixture[] {
  const fixtures: Fixture[] = [];

  rounds.forEach((pairs, roundIndex) => {
    for (const [a, b] of pairs) {
      const stateA = stateOf(states, a);
      const stateB = stateOf(states, b);

      const costAHome = venueCost(stateA, 'H') + venueCost(stateB, 'A');
      const costBHome = venueCost(stateB, 'H') + venueCost(stateA, 'A');

      // Ties are broken by the seeded Rng, so the schedule stays varied
      // between careers instead of always favouring the same side.
      const aHosts = costAHome === costBHome ? rng.chance(0.5) : costAHome < costBHome;

      applyVenue(stateA, aHosts ? 'H' : 'A');
      applyVenue(stateB, aHosts ? 'A' : 'H');

      fixtures.push({
        round: roundIndex + 1,
        homeClubId: aHosts ? a : b,
        awayClubId: aHosts ? b : a,
      });
    }
  });

  return fixtures;
}

/**
 * Places already-oriented rounds into a sequence that keeps home and away
 * runs short.
 *
 * In the return half the venues are fixed by the mirror, so the only lever
 * left is which round is played when. Greedily picking the round that costs
 * the fewest broken rhythms is enough — and without it, a mirrored second
 * half stacks up runs of seven or more identical venues.
 */
function orderRounds(
  candidates: Fixture[][],
  offset: number,
  states: Map<string, VenueState>,
  rng: Rng,
): Fixture[] {
  const remaining = [...candidates];
  const ordered: Fixture[] = [];

  for (let placed = 0; placed < candidates.length; placed += 1) {
    let bestCost = Number.POSITIVE_INFINITY;
    let bestIndices: number[] = [];

    remaining.forEach((round, index) => {
      const cost = round.reduce(
        (sum, fixture) =>
          sum +
          venueCost(stateOf(states, fixture.homeClubId), 'H') +
          venueCost(stateOf(states, fixture.awayClubId), 'A'),
        0,
      );

      if (cost < bestCost) {
        bestCost = cost;
        bestIndices = [index];
      } else if (cost === bestCost) {
        bestIndices.push(index);
      }
    });

    const chosenIndex = bestIndices.length === 1 ? bestIndices[0] : rng.pick(bestIndices);
    const [chosen] = remaining.splice(chosenIndex as number, 1);

    for (const fixture of chosen as Fixture[]) {
      applyVenue(stateOf(states, fixture.homeClubId), 'H');
      applyVenue(stateOf(states, fixture.awayClubId), 'A');
      ordered.push({ ...fixture, round: offset + placed + 1 });
    }
  }

  return ordered;
}

/** The deterministic Rng for a league's calendar in a given season. */
export function calendarRngFor(seed: Seed, season: number, leagueId: string): Rng {
  return createRng(deriveSeed(seed, 'calendar', season, leagueId));
}

export function fixturesInRound(calendar: Calendar, round: number): Fixture[] {
  return calendar.filter((fixture) => fixture.round === round);
}

export function fixturesForClub(calendar: Calendar, clubId: string): Fixture[] {
  return calendar.filter(
    (fixture) => fixture.homeClubId === clubId || fixture.awayClubId === clubId,
  );
}

/** The club's single match in a round, or undefined if the round has none. */
export function fixtureForClubInRound(
  calendar: Calendar,
  clubId: string,
  round: number,
): Fixture | undefined {
  return calendar.find(
    (fixture) =>
      fixture.round === round &&
      (fixture.homeClubId === clubId || fixture.awayClubId === clubId),
  );
}

export function isHome(fixture: Fixture, clubId: string): boolean {
  return fixture.homeClubId === clubId;
}

export function opponentOf(fixture: Fixture, clubId: string): string {
  return fixture.homeClubId === clubId ? fixture.awayClubId : fixture.homeClubId;
}
