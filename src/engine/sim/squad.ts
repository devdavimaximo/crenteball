/**
 * Squad generation for AI clubs.
 *
 * Squads are **derived, not stored**. A club's squad is a pure function of
 * (career seed, season, club id), so it is regenerated identically whenever
 * needed and never occupies a byte in the save file. Twenty clubs of
 * twenty-two players would otherwise be 440 people persisted every week for a
 * fifteen-season career.
 *
 * This is the "two speeds" rule in practice: the player's own club gets
 * detailed, persisted simulation; the rest of the world is reconstructed on
 * demand and nobody can tell the difference.
 */
import type { NamePool } from '@/content/schema';
import {
  AGE_MAX,
  AGE_MEAN,
  AGE_MIN,
  AGE_SPREAD,
  ATTRIBUTE_SPREAD,
  DECLINE_PER_YEAR,
  MATURITY_AT_MIN_AGE,
  MEAN_MATURITY,
  PEAK_AGE,
  POSITION_PROFILES,
  SKILL_BASE,
  SKILL_PER_REPUTATION,
  SQUAD_COMPOSITION,
  SQUAD_SKILL_SPREAD,
  STRENGTH_BENCH_WEIGHT,
  STRENGTH_STARTER_COUNT,
} from '@/engine/balance/squad';
import { ATTRIBUTE_KEYS, clampAttribute, overall } from '@/engine/domain/attributes';
import type { Attributes } from '@/engine/domain/attributes';
import type { Club } from '@/engine/domain/club';
import { POSITIONS } from '@/engine/domain/state';
import type { Position } from '@/engine/domain/state';
import type { Rng, Seed } from '@/engine/rng';
import { createRng, deriveSeed } from '@/engine/rng';

/**
 * A non-player character footballer. Lighter than the player's own `Player`:
 * no faith, no condition, no contract — those only exist for the one career
 * the game is actually about.
 */
export interface SquadPlayer {
  readonly id: string;
  readonly name: string;
  readonly position: Position;
  readonly age: number;
  readonly attributes: Attributes;
  /** Ceiling this player can still reach. Never shown directly to the player. */
  readonly potential: number;
}

/** Average skill a club of this reputation fields. */
export function skillForReputation(reputation: number): number {
  return SKILL_BASE + reputation * SKILL_PER_REPUTATION;
}

function generateName(rng: Rng, names: NamePool): string {
  return `${rng.pick(names.given)} ${rng.pick(names.surnames)}`;
}

function generateAge(rng: Rng): number {
  return Math.min(AGE_MAX, Math.max(AGE_MIN, Math.round(rng.gaussian(AGE_MEAN, AGE_SPREAD))));
}

function generateAttributes(rng: Rng, skill: number, position: Position): Attributes {
  const profile = POSITION_PROFILES[position];

  const attributes = {} as Record<(typeof ATTRIBUTE_KEYS)[number], number>;
  for (const key of ATTRIBUTE_KEYS) {
    attributes[key] = clampAttribute(rng.gaussian(skill * profile[key], ATTRIBUTE_SPREAD));
  }
  return attributes;
}

/**
 * How much of his peak ability a player has at a given age.
 *
 * Rises linearly from `MATURITY_AT_MIN_AGE` to 1.0 at the peak, then declines
 * slowly. Exported because the same curve governs the player's own career
 * progression later — a teenager and a veteran should age by the same rules
 * the world does.
 */
export function maturityAt(age: number): number {
  if (age >= PEAK_AGE) {
    return Math.max(0.5, 1 - DECLINE_PER_YEAR * (age - PEAK_AGE));
  }
  const progress = (age - AGE_MIN) / (PEAK_AGE - AGE_MIN);
  return MATURITY_AT_MIN_AGE + (1 - MATURITY_AT_MIN_AGE) * progress;
}

/**
 * Builds one club's squad.
 *
 * `rng` must be forked for this club and season — see `squadRngFor` — so that
 * generating Amazônia FC's squad never depends on whether the player looked at
 * another club first.
 */
export function generateSquad(club: Club, names: NamePool, rng: Rng): SquadPlayer[] {
  const clubSkill = skillForReputation(club.reputation);
  const squad: SquadPlayer[] = [];

  for (const position of POSITIONS) {
    const count = SQUAD_COMPOSITION[position];

    for (let index = 0; index < count; index += 1) {
      // Peak ability first, then scaled by age. Dividing by MEAN_MATURITY
      // re-centres the squad so its *current* average still matches the
      // club's reputation despite most players being below their peak.
      const peakSkill = rng.gaussian(clubSkill / MEAN_MATURITY, SQUAD_SKILL_SPREAD);
      const age = generateAge(rng);
      const currentSkill = peakSkill * maturityAt(age);
      const attributes = generateAttributes(rng, currentSkill, position);

      squad.push({
        id: `${club.id}-${position.toLowerCase()}-${String(index)}`,
        name: generateName(rng, names),
        position,
        age,
        attributes,
        // Never below what he already is: attribute noise can push a player
        // above his nominal peak.
        potential: Math.max(clampAttribute(peakSkill), overall(attributes)),
      });
    }
  }

  return squad;
}

/** The deterministic Rng for a club's squad in a given season. */
export function squadRngFor(seed: Seed, season: number, clubId: string): Rng {
  return createRng(deriveSeed(seed, 'squad', season, clubId));
}

/**
 * Reduces a squad to one number, for simulating matches between AI clubs.
 *
 * The best eleven carry most of the weight; the rest of the squad contributes
 * at a discount, standing in for depth across a long season.
 */
export function squadStrength(squad: readonly SquadPlayer[]): number {
  if (squad.length === 0) return 0;

  const ratings = squad.map((player) => overall(player.attributes)).sort((a, b) => b - a);

  const starters = ratings.slice(0, STRENGTH_STARTER_COUNT);
  const bench = ratings.slice(STRENGTH_STARTER_COUNT);

  const starterTotal = starters.reduce((sum, rating) => sum + rating, 0);
  const benchTotal = bench.reduce((sum, rating) => sum + rating, 0) * STRENGTH_BENCH_WEIGHT;
  const weight = starters.length + bench.length * STRENGTH_BENCH_WEIGHT;

  return (starterTotal + benchTotal) / weight;
}
