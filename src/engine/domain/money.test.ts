import { describe, expect, it } from 'vitest';

import { add, fromCents, fromUnits, isMoney, scale, subtract, ZERO } from './money';

describe('money', () => {
  it('converts whole currency units to cents', () => {
    expect(fromUnits(1500)).toBe(150_000);
  });

  it('refuses fractional units, pointing at the precise constructor', () => {
    expect(() => fromUnits(19.9)).toThrow(TypeError);
  });

  it('refuses fractional cents', () => {
    expect(() => fromCents(0.5)).toThrow(TypeError);
  });

  it('adds and subtracts exactly', () => {
    expect(add(fromUnits(10), fromUnits(5))).toBe(fromUnits(15));
    expect(subtract(fromUnits(10), fromUnits(15))).toBe(fromUnits(-5));
  });

  it('survives the float trap that motivates this whole module', () => {
    // 0.1 + 0.2 !== 0.3 in floats. In cents it is exact.
    const total = add(fromCents(10), fromCents(20));
    expect(total).toBe(fromCents(30));
  });

  it('stays exact across many small transactions', () => {
    let balance = ZERO;
    for (let i = 0; i < 10_000; i += 1) balance = add(balance, fromCents(1));
    expect(balance).toBe(fromUnits(100));
  });

  it('rounds a scaled amount to the nearest cent', () => {
    // A 15% agent fee on R$ 33,33.
    expect(scale(fromCents(3333), 0.15)).toBe(fromCents(500));
    expect(Number.isInteger(scale(fromCents(777), 0.333))).toBe(true);
  });

  it('recognises valid money at runtime', () => {
    expect(isMoney(1234)).toBe(true);
    expect(isMoney(12.34)).toBe(false);
    expect(isMoney('1234')).toBe(false);
  });
});
