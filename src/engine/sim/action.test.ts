import { describe, expect, it } from 'vitest';

import type { Point } from '@/engine/domain/pitch';
import { directionTo } from '@/engine/domain/pitch';
import { createRng } from '@/engine/rng';

import { classifyAction, resolveAction } from './action';
import type { Aim, PlayerSkills } from './action';
import type { MatchMoment } from './spatialMoment';

const SEED = 20260721;

const SKILLS: PlayerSkills = {
  finishing: 60,
  passing: 60,
  dribbling: 55,
  composure: 55,
  keeperRating: 52,
};

/** A moment with a ball, one teammate wide, and defenders in front of goal. */
function moment(overrides: Partial<MatchMoment> = {}): MatchMoment {
  return {
    id: 'm',
    minute: 30,
    type: 'shot',
    ball: { x: -6, y: 16 },
    teammates: [{ id: 'mate-0', point: { x: 12, y: 8 } }],
    defenders: [{ id: 'def-0', point: { x: -3, y: 9 } }],
    keeper: { x: -1, y: 0.7 },
    ...overrides,
  };
}

/** An aim pointing from the ball towards a pitch point. */
function aimAt(from: Point, to: Point, power = 0.6): Aim {
  return { dir: directionTo(from, to), power };
}

describe('classifyAction — the aim decides', () => {
  it('reads an aim at the goal as a shot', () => {
    const m = moment();
    expect(classifyAction(m, aimAt(m.ball, { x: 0, y: 0 }))).toBe('shot');
  });

  it('reads an aim at a teammate as a pass', () => {
    const m = moment();
    expect(classifyAction(m, aimAt(m.ball, m.teammates[0]!.point))).toBe('pass');
  });

  it('reads a wide ball aimed at a teammate in the box as a cross', () => {
    const m = moment({
      ball: { x: 26, y: 14 },
      teammates: [{ id: 'mate-0', point: { x: 2, y: 8 } }],
    });
    expect(classifyAction(m, aimAt(m.ball, m.teammates[0]!.point))).toBe('cross');
  });

  it('reads an aim into empty space as a through-ball', () => {
    const m = moment({ teammates: [] });
    // Aim sideways into space, away from goal and any teammate.
    expect(classifyAction(m, aimAt(m.ball, { x: 30, y: 30 }))).toBe('through-ball');
  });

  it('does not read a long ball from the halfway line as a shot', () => {
    const m = moment({ ball: { x: 0, y: 50 } });
    expect(classifyAction(m, aimAt(m.ball, { x: 0, y: 0 }))).not.toBe('shot');
  });
});

describe('resolveAction — shots', () => {
  it('produces a shot result when aimed at goal', () => {
    const m = moment();
    const result = resolveAction(m, aimAt(m.ball, { x: 0, y: 0 }), SKILLS, 0, createRng(SEED));
    expect(result.kind).toBe('shot');
    expect(result.shot).not.toBeNull();
    expect(result.pass).toBeNull();
  });

  it('a goal is scored by the player himself', () => {
    const m = moment({ ball: { x: 0, y: 7 }, defenders: [] });
    const rng = createRng(SEED);
    let goals = 0;
    let playerGoals = 0;
    for (let i = 0; i < 400; i += 1) {
      const result = resolveAction(m, aimAt(m.ball, { x: 0, y: 0 }), SKILLS, 0, rng);
      if (result.goal) {
        goals += 1;
        if (result.scoredByPlayer) playerGoals += 1;
      }
    }
    expect(goals).toBeGreaterThan(0);
    expect(playerGoals).toBe(goals);
  });
});

describe('resolveAction — passes', () => {
  it('produces a pass result when aimed at a teammate', () => {
    const m = moment();
    const result = resolveAction(
      m,
      aimAt(m.ball, m.teammates[0]!.point),
      SKILLS,
      0,
      createRng(SEED),
    );
    expect(result.kind).toBe('pass');
    expect(result.pass).not.toBeNull();
    expect(result.receiverId).toBe('mate-0');
  });

  it('a goal from a pass is credited as a setup, not scored by the player', () => {
    // Teammate in the box: a completed ball can be finished by him.
    const m = moment({
      ball: { x: 18, y: 12 },
      teammates: [{ id: 'mate-0', point: { x: 2, y: 7 } }],
      defenders: [],
    });
    const rng = createRng(SEED);
    let assisted = 0;
    for (let i = 0; i < 600; i += 1) {
      const result = resolveAction(m, aimAt(m.ball, m.teammates[0]!.point), SKILLS, 0, rng);
      if (result.goal) {
        expect(result.scoredByPlayer).toBe(false);
        assisted += 1;
      }
    }
    expect(assisted).toBeGreaterThan(0);
  });
});

describe('determinism', () => {
  it('replays the same action identically', () => {
    const m = moment();
    const aim = aimAt(m.ball, { x: 0, y: 0 });
    expect(resolveAction(m, aim, SKILLS, 0.4, createRng(SEED))).toEqual(
      resolveAction(m, aim, SKILLS, 0.4, createRng(SEED)),
    );
  });
});

describe('the faith pillar reaches passing too', () => {
  it('a composed player keeps more under pressure', () => {
    const m = moment({ ball: { x: 18, y: 20 }, teammates: [{ id: 'mate-0', point: { x: -6, y: 10 } }], defenders: [{ id: 'd', point: { x: 6, y: 15 } }] });
    const aim = aimAt(m.ball, m.teammates[0]!.point);

    const completes = (composure: number) => {
      const rng = createRng(SEED);
      let ok = 0;
      for (let i = 0; i < 1500; i += 1) {
        const r = resolveAction(m, aim, { ...SKILLS, composure }, 1, rng);
        if (r.pass?.outcome === 'complete') ok += 1;
      }
      return ok;
    };

    expect(completes(95)).toBeGreaterThan(completes(10));
  });
});
