/**
 * Clubs, as the engine sees them.
 *
 * Distinct from `ClubData` in content/: that is the raw JSON shape, this is
 * the domain entity with money as Money and no presentation-only fields the
 * simulation does not care about. The mapping happens here, once, at the
 * boundary — so a change to the data file never ripples into the systems.
 */
import type { ClubData } from '@/content/schema';

import type { Money } from './money';
import { fromUnits } from './money';

export interface Club {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly city: string;
  readonly reputation: number;
  readonly budget: Money;
  readonly stadiumCapacity: number;
}

export function toClub(data: ClubData): Club {
  return {
    id: data.id,
    name: data.name,
    shortName: data.shortName,
    city: data.city,
    reputation: data.reputation,
    // Content stores whole reais; the domain stores cents.
    budget: fromUnits(data.budget),
    stadiumCapacity: data.stadiumCapacity,
  };
}
