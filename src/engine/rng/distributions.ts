/**
 * Distributions built on the seeded Rng.
 *
 * Separate from the Rng interface itself: `next`, `int` and `pick` are what
 * every caller needs, while these are specialised enough that putting them on
 * the interface would make every future Rng implementation carry them.
 */
import type { Rng } from './index';

/**
 * Knuth's Poisson sampler — the standard model for football scorelines.
 * Produces plenty of 1-0s and 2-1s, the occasional 4-0, almost never a 9-8.
 *
 * `cap` guards against a pathological lambda spinning the loop; it is a
 * safety rail, not a game rule, and normal play never approaches it.
 */
export function poisson(rng: Rng, lambda: number, cap = 20): number {
  const limit = Math.exp(-lambda);
  let count = 0;
  let product = rng.next();

  while (product > limit) {
    count += 1;
    product *= rng.next();
    if (count > cap) break;
  }

  return count;
}
