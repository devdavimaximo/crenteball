/**
 * Content loading.
 *
 * JSON is imported statically so Vite bundles and type-checks it, then
 * validated at module load. A malformed data file is a startup failure in
 * development, never a mystery three screens into a season.
 *
 * The validation cost is paid once per session on a handful of small files —
 * cheap insurance for hand-edited content.
 */
import ligaBrasilJson from './leagues/liga-brasil.json';
import brasilNamesJson from './names/brasil.json';
import type { ClubData, LeagueData, NamePool } from './schema';
import { leagueDataSchema, namePoolSchema } from './schema';

function parseLeague(raw: unknown, source: string): LeagueData {
  const result = leagueDataSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Conteúdo inválido em ${source}:\n${issues}`);
  }
  return result.data;
}

function parseNamePool(raw: unknown, source: string): NamePool {
  const result = namePoolSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Conteúdo inválido em ${source}:\n${issues}`);
  }
  return result.data;
}

export const LIGA_BRASIL: LeagueData = parseLeague(ligaBrasilJson, 'leagues/liga-brasil.json');

export const BRASIL_NAMES: NamePool = parseNamePool(brasilNamesJson, 'names/brasil.json');

/** Every league the game ships with. The MVP has exactly one. */
export const LEAGUES: readonly LeagueData[] = [LIGA_BRASIL];

export function findLeague(id: string): LeagueData | undefined {
  return LEAGUES.find((league) => league.id === id);
}

export function findClub(league: LeagueData, id: string): ClubData | undefined {
  return league.clubs.find((club) => club.id === id);
}

export type { ClubData, LeagueData, NamePool } from './schema';
