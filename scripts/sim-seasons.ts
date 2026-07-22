/**
 * Balance harness.
 *
 * Simulates N seasons headlessly and reports the shapes that decide whether
 * the game is fun: how many goals get scored, how many points win a league,
 * whether the same club wins every year, and whether the table ends up
 * ordered roughly by squad quality.
 *
 * This is the only tool that catches balance drift before a player does. A
 * green test suite says the code works; this says the *game* works.
 *
 *   npm run sim:seasons
 *   npm run sim:seasons -- 50
 *   npm run sim:seasons -- 50 --seed 1234
 */
import { BRASIL_NAMES, LIGA_BRASIL } from '@/content';
import { simulateSeason, seasonStrengths } from '@/engine/sim/season';
import type { SeasonResult } from '@/engine/sim/season';

interface Options {
  seasons: number;
  seed: number;
}

function parseOptions(argv: readonly string[]): Options {
  const positional = argv.filter((arg) => !arg.startsWith('--'));
  const seedIndex = argv.indexOf('--seed');

  return {
    seasons: Number(positional[0] ?? 20),
    seed: seedIndex === -1 ? 20260721 : Number(argv[seedIndex + 1] ?? 20260721),
  };
}

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const format = (value: number, digits = 1): string => value.toFixed(digits);

/** Pearson correlation — how closely the table tracked squad strength. */
function correlation(xs: readonly number[], ys: readonly number[]): number {
  const meanX = mean(xs);
  const meanY = mean(ys);

  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;

  for (let i = 0; i < xs.length; i += 1) {
    const dx = (xs[i] as number) - meanX;
    const dy = (ys[i] as number) - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }

  const denominator = Math.sqrt(varianceX * varianceY);
  return denominator === 0 ? 0 : covariance / denominator;
}

function bar(value: number, max: number, width = 28): string {
  const filled = Math.round((value / max) * width);
  return '#'.repeat(Math.max(0, filled));
}

function reportSeason(result: SeasonResult, strengths: Map<string, number>) {
  const goals = result.results.reduce((sum, match) => sum + match.homeGoals + match.awayGoals, 0);
  const draws = result.results.filter((match) => match.homeGoals === match.awayGoals).length;
  const homeWins = result.results.filter((match) => match.homeGoals > match.awayGoals).length;

  const champion = result.table[0];
  const bottom = result.table[result.table.length - 1];

  return {
    season: result.season,
    championId: champion?.clubId ?? '',
    championPoints: champion?.points ?? 0,
    bottomPoints: bottom?.points ?? 0,
    goalsPerMatch: goals / result.results.length,
    drawRate: draws / result.results.length,
    homeWinRate: homeWins / result.results.length,
    topScorerGoals: result.scorers[0]?.goals ?? 0,
    strengthCorrelation: correlation(
      result.table.map((row) => strengths.get(row.clubId) ?? 0),
      result.table.map((row) => row.points),
    ),
  };
}

function main(): void {
  const { seasons, seed } = parseOptions(process.argv.slice(2));

  if (!Number.isInteger(seasons) || seasons < 1) {
    console.error('Uso: npm run sim:seasons -- <temporadas> [--seed <n>]');
    process.exit(1);
  }

  const startedAt = Date.now();
  const clubName = new Map(LIGA_BRASIL.clubs.map((club) => [club.id, club.shortName]));

  const reports = [];
  for (let season = 1; season <= seasons; season += 1) {
    const result = simulateSeason(LIGA_BRASIL, BRASIL_NAMES, seed, season);
    reports.push(reportSeason(result, seasonStrengths(LIGA_BRASIL, BRASIL_NAMES, seed, season)));
  }

  const elapsed = Date.now() - startedAt;

  console.log(`\n${LIGA_BRASIL.name} — ${String(seasons)} temporadas (seed ${String(seed)})`);
  console.log('='.repeat(64));

  console.log('\nPor temporada');
  console.table(
    reports.map((report) => ({
      T: report.season,
      campeao: clubName.get(report.championId) ?? '?',
      pts: report.championPoints,
      lanterna: report.bottomPoints,
      'gols/jogo': format(report.goalsPerMatch, 2),
      'casa%': format(report.homeWinRate * 100),
      'empate%': format(report.drawRate * 100),
      artilheiro: report.topScorerGoals,
      'r(forca,pts)': format(report.strengthCorrelation, 2),
    })),
  );

  console.log('\nMedias');
  console.log('-'.repeat(64));

  const rows: [string, string, string][] = [
    ['gols por jogo', format(mean(reports.map((r) => r.goalsPerMatch)), 2), 'real: 2.6 a 2.8'],
    ['vitorias em casa', `${format(mean(reports.map((r) => r.homeWinRate)) * 100)}%`, 'real: 43 a 49%'],
    ['empates', `${format(mean(reports.map((r) => r.drawRate)) * 100)}%`, 'real: 22 a 28%'],
    ['pontos do campeao', format(mean(reports.map((r) => r.championPoints))), 'real: 70 a 85'],
    ['pontos do lanterna', format(mean(reports.map((r) => r.bottomPoints))), 'real: 15 a 35'],
    ['gols do artilheiro', format(mean(reports.map((r) => r.topScorerGoals))), 'real: 18 a 30'],
    [
      'correlacao forca/pontos',
      format(mean(reports.map((r) => r.strengthCorrelation)), 2),
      'alvo: 0.75 a 0.92',
    ],
  ];

  for (const [label, value, reference] of rows) {
    console.log(`${label.padEnd(26)} ${value.padStart(7)}   ${reference}`);
  }

  console.log('\nTitulos');
  console.log('-'.repeat(64));

  const titles = new Map<string, number>();
  for (const report of reports) {
    titles.set(report.championId, (titles.get(report.championId) ?? 0) + 1);
  }

  const ranked = [...titles.entries()].sort((a, b) => b[1] - a[1]);
  const most = ranked[0]?.[1] ?? 0;

  for (const [clubId, count] of ranked) {
    const share = (count / seasons) * 100;
    console.log(
      `${(clubName.get(clubId) ?? '?').padEnd(6)} ${String(count).padStart(3)}  ` +
        `${format(share).padStart(5)}%  ${bar(count, most)}`,
    );
  }

  console.log(
    `\n${String(ranked.length)} campeoes diferentes em ${String(seasons)} temporadas` +
      `  ·  ${String(elapsed)}ms  ·  ${String(seasons * 380)} partidas`,
  );

  // A single club taking most of the titles means the league is decided by
  // reputation alone, and a career at a small club would be pointless.
  const dominance = most / seasons;
  if (dominance > 0.5 && seasons >= 10) {
    console.log(
      `\nAVISO: ${clubName.get(ranked[0]?.[0] ?? '') ?? '?'} venceu ${format(dominance * 100)}% ` +
        'das temporadas. Considere aumentar STRENGTH_SCALE em engine/balance/match.ts.',
    );
  }
}

main();
