/**
 * Starting a career.
 *
 * Everything the creation screen is not allowed to decide lives here: which
 * club gives a 17-year-old his first contract, what that contract is worth,
 * and whether the points he distributed across his six attributes are legal.
 * The screen collects a name, a position, a face and six numbers — the rules
 * about them are the engine's (CLAUDE.md section 13).
 */
import type { ClubData, LeagueData } from '@/content/schema';
import {
  FIRST_CLUB_POOL,
  FIRST_CONTRACT_SEASONS,
  FIRST_SEASON,
  FIRST_WAGE_BASE,
  FIRST_WAGE_PER_REPUTATION,
  MAX_STARTING_ATTRIBUTE,
  STARTING_ATTRIBUTE,
  STARTING_ATTRIBUTE_POINTS,
} from '@/engine/balance/career';
import type { Appearance } from '@/engine/domain/appearance';
import { ATTRIBUTE_KEYS } from '@/engine/domain/attributes';
import type { Attributes } from '@/engine/domain/attributes';
import type { Money } from '@/engine/domain/money';
import { fromCents } from '@/engine/domain/money';
import { createInitialState } from '@/engine/domain/state';
import type { Contract, GameState, Position } from '@/engine/domain/state';
import type { Rng, Seed } from '@/engine/rng';
import { createRng, deriveSeed } from '@/engine/rng';

export interface CareerStart {
  readonly seed: Seed;
  readonly name: string;
  readonly position: Position;
  readonly appearance: Appearance;
  /** ISO 8601, injected so career creation stays a pure function. */
  readonly createdAt: string;
  /** The full six, as chosen on the creation screen. */
  readonly attributes: Attributes;
}

/**
 * The clubs willing to take a chance on an unknown teenager: the weakest of
 * the league, by reputation.
 *
 * Sorted by id as a tiebreaker so two clubs on the same reputation never
 * depend on the order the content file happens to list them in — a data-file
 * reshuffle must not change which club an existing seed produces.
 */
export function eligibleFirstClubs(league: LeagueData): readonly ClubData[] {
  return [...league.clubs]
    .sort((a, b) => a.reputation - b.reputation || a.id.localeCompare(b.id))
    .slice(0, FIRST_CLUB_POOL);
}

/** What a club of this reputation pays a first-contract youngster each week. */
export function firstWage(reputation: number): Money {
  return fromCents(FIRST_WAGE_BASE + FIRST_WAGE_PER_REPUTATION * reputation);
}

/** The deterministic Rng that decides where a career begins. */
export function firstClubRngFor(seed: Seed): Rng {
  return createRng(deriveSeed(seed, 'first-club'));
}

export type AttributeIssue =
  | { readonly kind: 'wrong-total'; readonly spent: number; readonly allowed: number }
  | { readonly kind: 'below-base'; readonly key: keyof Attributes }
  | { readonly kind: 'above-cap'; readonly key: keyof Attributes; readonly cap: number };

/**
 * Checks a creation-screen attribute spread.
 *
 * Two rules, both about the shape of the player who walks out of creation: he
 * spends exactly the points he is given, and no single attribute is pushed to
 * a cartoon. A 99-finishing, 1-everything-else build would beat the match
 * minigame without ever playing football.
 */
export function validateStartingAttributes(attributes: Attributes): AttributeIssue[] {
  const issues: AttributeIssue[] = [];
  let spent = 0;

  for (const key of ATTRIBUTE_KEYS) {
    const value = attributes[key];
    if (value < STARTING_ATTRIBUTE) issues.push({ kind: 'below-base', key });
    else if (value > MAX_STARTING_ATTRIBUTE) {
      issues.push({ kind: 'above-cap', key, cap: MAX_STARTING_ATTRIBUTE });
    }
    spent += value - STARTING_ATTRIBUTE;
  }

  if (spent !== STARTING_ATTRIBUTE_POINTS) {
    issues.push({ kind: 'wrong-total', spent, allowed: STARTING_ATTRIBUTE_POINTS });
  }

  return issues;
}

/**
 * Builds the career's opening state, first club and all.
 *
 * The club is drawn rather than chosen: picking from a list would invite
 * starting at the strongest side available, which flattens the climb the whole
 * game is built around (design pillar 2).
 */
export function startCareer(start: CareerStart, league: LeagueData, rng: Rng): GameState {
  const club = rng.pick(eligibleFirstClubs(league));

  const contract: Contract = {
    leagueId: league.id,
    clubId: club.id,
    weeklyWage: firstWage(club.reputation),
    untilSeason: FIRST_SEASON + FIRST_CONTRACT_SEASONS - 1,
  };

  return createInitialState({
    seed: start.seed,
    name: start.name,
    position: start.position,
    appearance: start.appearance,
    createdAt: start.createdAt,
    contract,
    attributes: start.attributes,
  });
}
