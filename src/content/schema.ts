/**
 * Schemas for the game's content data.
 *
 * Content is data, not code: adding a league or rebalancing a club's budget
 * must never require touching the engine. These schemas are what make that
 * safe — a typo in a JSON file fails loudly at load, in development, instead
 * of producing a club with `NaN` reputation halfway through a season.
 *
 * Note this layer defines *raw data* shapes only. It cannot import from
 * engine/ (enforced by lint), and the mapping from this data into domain
 * entities happens in the engine's world generation.
 */
import { z } from 'zod';

/** Kebab-case, stable forever: ids end up inside player save files. */
const idSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id deve ser kebab-case (ex.: atletico-guanabara)');

const hexColourSchema = z.string().regex(/^#[0-9a-f]{6}$/, 'cor deve ser hex de 6 dígitos');

export const clubDataSchema = z.object({
  id: idSchema,
  name: z.string().min(3).max(40),
  /** Three letters for tables and scoreboards: GUA, IPI, CER. */
  shortName: z.string().length(3).regex(/^[A-Z]{3}$/),
  city: z.string().min(2).max(40),
  colours: z.object({
    primary: hexColourSchema,
    secondary: hexColourSchema,
  }),
  /**
   * 1..100. Drives squad quality, transfer appeal and crowd size. The single
   * most important number in a club's data — see engine/balance.
   */
  reputation: z.number().int().min(1).max(100),
  /** Whole reais. Converted to Money (cents) by the engine on load. */
  budget: z.number().int().nonnegative(),
  stadiumCapacity: z.number().int().min(1000).max(120_000),
});

export type ClubData = z.infer<typeof clubDataSchema>;

export const leagueDataSchema = z
  .object({
    id: idSchema,
    name: z.string().min(3).max(40),
    country: z.string().min(2).max(40),
    /** 1 is the top division of its country. */
    tier: z.number().int().min(1).max(5),
    clubs: z.array(clubDataSchema).min(4),
  })
  .refine((league) => league.clubs.length % 2 === 0, {
    message: 'uma liga precisa de um número par de clubes, senão há bye em toda rodada',
    path: ['clubs'],
  })
  .refine((league) => new Set(league.clubs.map((club) => club.id)).size === league.clubs.length, {
    message: 'ids de clube duplicados',
    path: ['clubs'],
  })
  .refine(
    (league) =>
      new Set(league.clubs.map((club) => club.shortName)).size === league.clubs.length,
    { message: 'siglas de clube duplicadas — a tabela ficaria ambígua', path: ['clubs'] },
  );

export type LeagueData = z.infer<typeof leagueDataSchema>;

/**
 * Name pools for generating fictional players.
 *
 * Split into given names and surnames so the generator can combine them: a
 * few dozen of each yields thousands of distinct names, which is what keeps a
 * world of several leagues from feeling repetitive.
 */
export const namePoolSchema = z.object({
  id: idSchema,
  given: z.array(z.string().min(2).max(20)).min(20),
  surnames: z.array(z.string().min(2).max(20)).min(20),
});

export type NamePool = z.infer<typeof namePoolSchema>;
