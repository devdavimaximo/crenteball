/**
 * Money.
 *
 * Always an integer number of cents. Never a float: 0.1 + 0.2 !== 0.3, and a
 * career spans thousands of transactions — wages, bonuses, transfers, taxes —
 * so drift compounds into a balance that does not add up on screen.
 *
 * The brand makes that a compile-time rule: a raw `number` cannot be assigned
 * to `Money` by accident.
 */
declare const MONEY: unique symbol;

export type Money = number & { readonly [MONEY]: true };

export const ZERO = 0 as Money;

/** Builds Money from whole currency units (reais). `fromUnits(1500)` = R$ 1.500,00. */
export function fromUnits(units: number): Money {
  if (!Number.isInteger(units)) {
    throw new TypeError(`Money units must be whole, got ${units}. Use fromCents() for precision.`);
  }
  return (units * 100) as Money;
}

/** Builds Money from an exact number of cents. */
export function fromCents(cents: number): Money {
  if (!Number.isInteger(cents)) {
    throw new TypeError(`Money must be a whole number of cents, got ${cents}`);
  }
  return cents as Money;
}

export function add(a: Money, b: Money): Money {
  return (a + b) as Money;
}

export function subtract(a: Money, b: Money): Money {
  return (a - b) as Money;
}

/**
 * Scales money by a ratio — a 15% agent fee, a wage rise, a sponsorship cut.
 * Rounds to the nearest cent, because a fraction of a cent cannot exist.
 */
export function scale(amount: Money, ratio: number): Money {
  return Math.round(amount * ratio) as Money;
}

export function isMoney(value: unknown): value is Money {
  return typeof value === 'number' && Number.isInteger(value);
}
