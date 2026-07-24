import { describe, expect, it } from 'vitest';

import { DEFAULT_APPEARANCE } from '@/engine/domain/appearance';
import { createRng } from '@/engine/rng';
import { generateMatchMoment } from '@/engine/sim/spatialMoment';

import { buildScene } from './buildScene';

const KITS = {
  player: { primary: '#c8102e', secondary: '#f2f2f2' },
  opponent: { primary: '#1c2431', secondary: '#39445a' },
  keeper: { primary: '#f0b429', secondary: '#7a5a12' },
};

function scene(type: Parameters<typeof generateMatchMoment>[0] = 'shot') {
  const moment = generateMatchMoment(type, 30, 0, createRng(1));
  return {
    moment,
    scene: buildScene({
      moment,
      appearance: DEFAULT_APPEARANCE,
      kits: KITS,
      rng: createRng(2),
    }),
  };
}

describe('buildScene', () => {
  it('places the player where the ball is, in the player kit', () => {
    const { moment, scene: s } = scene();
    expect(s.player.at).toEqual(moment.ball);
    expect(s.player.kit).toBe(KITS.player);
  });

  it('turns every teammate and defender into a figure', () => {
    const { moment, scene: s } = scene('through-ball');
    expect(s.teammates).toHaveLength(moment.teammates.length);
    expect(s.defenders).toHaveLength(moment.defenders.length);
    expect(s.teammates.every((f) => f.kit === KITS.player)).toBe(true);
    expect(s.defenders.every((f) => f.kit === KITS.opponent)).toBe(true);
  });

  it('dresses the keeper in the keeper kit', () => {
    expect(scene().scene.keeper.kit).toBe(KITS.keeper);
  });

  it('focuses the camera on the ball by default', () => {
    const { moment, scene: s } = scene();
    expect(s.focus).toEqual(moment.ball);
    expect(s.ballHeight).toBe(0);
  });

  it('is deterministic for a seed', () => {
    expect(scene('cross').scene).toEqual(scene('cross').scene);
  });

  it('gives background players varied looks, not one clone', () => {
    const { scene: s } = scene('cross');
    const looks = [...s.teammates, ...s.defenders].map(
      (f) => `${String(f.appearance.skinTone)}-${f.appearance.hairStyle}`,
    );
    // With a couple of teammates and three defenders, expect some variety.
    expect(new Set(looks).size).toBeGreaterThan(1);
  });
});
