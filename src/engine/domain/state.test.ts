import { describe, expect, it } from 'vitest';

import { DEFAULT_APPEARANCE } from './appearance';
import { ATTRIBUTE_KEYS } from './attributes';
import { fromUnits } from './money';
import { parseGameState } from './schema';
import { createInitialState } from './state';
import type { Contract, GameState } from './state';

const CONTRACT: Contract = {
  leagueId: 'liga-brasil',
  clubId: 'sao-luis-maranhense',
  weeklyWage: fromUnits(1020),
  untilSeason: 3,
};

const CAREER = {
  seed: 20260721,
  name: 'Davi Máximo',
  position: 'FW',
  appearance: DEFAULT_APPEARANCE,
  contract: CONTRACT,
  createdAt: '2026-07-21T18:00:00.000Z',
} as const;

function initial(): GameState {
  return createInitialState(CAREER);
}

describe('createInitialState', () => {
  it('is pure — same input, same state', () => {
    expect(createInitialState(CAREER)).toEqual(createInitialState(CAREER));
  });

  it('starts every attribute at the base value', () => {
    const { attributes } = initial().player;
    for (const key of ATTRIBUTE_KEYS) {
      expect(attributes[key], key).toBe(30);
    }
  });

  it('applies the points chosen at creation', () => {
    const state = createInitialState({ ...CAREER, attributes: { finishing: 50, pace: 45 } });
    expect(state.player.attributes.finishing).toBe(50);
    expect(state.player.attributes.pace).toBe(45);
    // Untouched attributes keep the base.
    expect(state.player.attributes.defending).toBe(30);
  });

  it('starts the faith pillar with no devotional yet', () => {
    expect(initial().player.faith.lastDevotionalWeek).toBeNull();
    expect(initial().player.faith.devotion).toBeGreaterThan(0);
  });

  it('keeps the seed so the career is reproducible', () => {
    expect(initial().seed).toBe(CAREER.seed);
  });

  it('starts neither in form nor out of it', () => {
    expect(initial().player.condition.form).toBe(50);
  });

  it('carries the face and the contract it was handed', () => {
    expect(initial().player.appearance).toEqual(DEFAULT_APPEARANCE);
    expect(initial().contract).toEqual(CONTRACT);
  });
});

describe('serialisation', () => {
  it('survives a JSON round trip unchanged — the state IS the save', () => {
    const state = initial();
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('holds no Date, function or undefined that JSON would silently drop', () => {
    const walk = (value: unknown, path: string): void => {
      expect(value, `${path} is undefined`).not.toBeUndefined();
      expect(typeof value, `${path} is a function`).not.toBe('function');
      expect(value instanceof Date, `${path} is a Date`).toBe(false);

      if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          walk(child, `${path}.${key}`);
        }
      }
    };

    // lastDevotionalWeek is null, which is fine — null survives JSON, undefined does not.
    walk(initial(), 'state');
  });

  it('stores money as whole cents, never a float', () => {
    expect(Number.isInteger(initial().finances.balance)).toBe(true);
  });
});

describe('parseGameState', () => {
  it('accepts a freshly created state', () => {
    const result = parseGameState(initial());
    expect(result.ok).toBe(true);
  });

  it('accepts a state that went through a file', () => {
    const result = parseGameState(JSON.parse(JSON.stringify(initial())));
    expect(result.ok).toBe(true);
  });

  it('rejects fractional money', () => {
    const broken = { ...initial(), finances: { balance: 1250.5 } };
    const result = parseGameState(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join()).toContain('finances.balance');
  });

  it('rejects an out-of-range attribute', () => {
    const state = initial();
    const broken = {
      ...state,
      player: { ...state.player, attributes: { ...state.player.attributes, pace: 140 } },
    };
    expect(parseGameState(broken).ok).toBe(false);
  });

  it('rejects a wage the club would be receiving instead of paying', () => {
    const broken = { ...initial(), contract: { ...CONTRACT, weeklyWage: -5000 } };
    const result = parseGameState(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join()).toContain('contract.weeklyWage');
  });

  it('rejects an appearance the renderer could not draw', () => {
    const state = initial();
    const broken = {
      ...state,
      player: { ...state.player, appearance: { ...DEFAULT_APPEARANCE, skinTone: 40 } },
    };
    expect(parseGameState(broken).ok).toBe(false);
  });

  it('rejects an unknown position', () => {
    const state = initial();
    const broken = { ...state, player: { ...state.player, position: 'ZAGUEIRO' } };
    expect(parseGameState(broken).ok).toBe(false);
  });

  it('rejects a truncated save', () => {
    const { player: _player, ...withoutPlayer } = initial();
    expect(parseGameState(withoutPlayer).ok).toBe(false);
  });

  it('rejects garbage instead of throwing', () => {
    expect(parseGameState(null).ok).toBe(false);
    expect(parseGameState('not a save').ok).toBe(false);
    expect(parseGameState(42).ok).toBe(false);
  });

  it('reports which field failed, for a real error message', () => {
    const state = initial();
    const broken = { ...state, clock: { season: 0, week: 1 } };
    const result = parseGameState(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join()).toContain('clock.season');
  });
});
