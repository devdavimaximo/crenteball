/**
 * League points and tie-breaking.
 *
 * Three points for a win is not a neutral choice: it is what makes chasing a
 * winner worth more than protecting a draw, and it shapes how a season's
 * final rounds feel.
 */
export const POINTS_FOR_WIN = 3;
export const POINTS_FOR_DRAW = 1;
export const POINTS_FOR_LOSS = 0;

/**
 * Tie-break order, following the Brazilian league's convention.
 *
 * Wins before goal difference matters more than it looks: it rewards a club
 * that wins and loses over one that draws its way to the same total, which
 * is the more entertaining season to play through.
 *
 * `clubId` is the final, arbitrary criterion. Real leagues draw lots; a
 * deterministic simulation cannot, and an unstable sort would make the table
 * shuffle on every render.
 */
export const TIE_BREAK_ORDER = [
  'points',
  'wins',
  'goalDifference',
  'goalsFor',
  'headToHead',
  'clubId',
] as const;

export type TieBreakCriterion = (typeof TIE_BREAK_ORDER)[number];
