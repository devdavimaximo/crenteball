/**
 * Runtime validation of the game state.
 *
 * TypeScript types vanish at runtime, and a save can arrive from outside the
 * program: a file the player exported months ago, edited by hand, or truncated
 * by a bad download. Loading a malformed state silently produces a career that
 * breaks three screens later, far from the cause.
 *
 * These schemas are the boundary. Anything crossing into the engine from
 * storage or a file goes through them first.
 */
import { z } from 'zod';

import { DEVOTION_MAX, DEVOTION_MIN } from '@/engine/balance/career';

import { ATTRIBUTE_KEYS, ATTRIBUTE_MAX, ATTRIBUTE_MIN } from './attributes';
import { fromCents } from './money';
import { POSITIONS } from './state';

const uint32 = z.number().int().min(0).max(0xffffffff);

const percentage = z.number().int().min(0).max(100);

const rating = z.number().int().min(ATTRIBUTE_MIN).max(ATTRIBUTE_MAX);

/**
 * Money is always whole cents — the schema is where that rule is enforced,
 * and also where the `Money` brand is restored: JSON carries plain numbers,
 * so anything crossing this boundary re-earns the brand by passing the
 * integer check.
 */
const money = z
  .number()
  .int()
  .transform((cents) => fromCents(cents));

const attributesSchema = z.object(
  Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, rating])) as Record<
    (typeof ATTRIBUTE_KEYS)[number],
    typeof rating
  >,
);

const clockSchema = z.object({
  season: z.number().int().positive(),
  week: z.number().int().positive(),
});

const conditionSchema = z.object({
  energy: percentage,
  morale: percentage,
});

const faithSchema = z.object({
  devotion: z.number().int().min(DEVOTION_MIN).max(DEVOTION_MAX),
  lastDevotionalWeek: z.number().int().positive().nullable(),
});

const playerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  position: z.enum(POSITIONS),
  age: z.number().int().min(14).max(50),
  attributes: attributesSchema,
  condition: conditionSchema,
  faith: faithSchema,
});

export const gameStateSchema = z.object({
  seed: uint32,
  createdAt: z.string().datetime(),
  clock: clockSchema,
  player: playerSchema,
  finances: z.object({ balance: money }),
});

export type ValidatedGameState = z.infer<typeof gameStateSchema>;

/**
 * Validates an unknown value as a game state.
 *
 * Returns a result instead of throwing so callers can show the player a real
 * message ("this save file is not readable") rather than a crash.
 */
export function parseGameState(
  value: unknown,
): { ok: true; state: ValidatedGameState } | { ok: false; issues: string[] } {
  const result = gameStateSchema.safeParse(value);
  if (result.success) return { ok: true, state: result.data };

  return {
    ok: false,
    issues: result.error.issues.map(
      (issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`,
    ),
  };
}
