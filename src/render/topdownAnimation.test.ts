import { describe, expect, it } from 'vitest';

import { flightMs, sampleActionAnimation } from './topdownAnimation';
import type { ActionAnimationSpec, FlightOutcome } from './topdownAnimation';

function spec(overrides: Partial<ActionAnimationSpec> = {}): ActionAnimationSpec {
  return {
    from: { x: -6, y: 18 },
    to: { x: 1, y: -1 },
    peakHeight: 2,
    outcome: 'goal',
    goal: true,
    power: 0.7,
    ...overrides,
  };
}

const OUTCOMES: FlightOutcome[] = [
  'goal',
  'saved',
  'post',
  'off',
  'blocked',
  'complete',
  'intercepted',
  'overhit',
];

function frames(s: ActionAnimationSpec, stepMs = 16) {
  const out = [];
  for (let t = 0; t <= 3000; t += stepMs) {
    const f = sampleActionAnimation(s, t);
    out.push(f);
    if (f.done) break;
  }
  return out;
}

describe('flightMs', () => {
  it('makes a harder strike arrive sooner', () => {
    expect(flightMs(spec({ power: 1 }))).toBeLessThan(flightMs(spec({ power: 0.1 })));
  });

  it('makes a longer ball take longer', () => {
    const near = flightMs(spec({ to: { x: 0, y: 14 } }));
    const far = flightMs(spec({ to: { x: 0, y: -30 } }));
    expect(far).toBeGreaterThan(near);
  });

  it('stays within readable bounds', () => {
    expect(flightMs(spec({ to: { x: 0, y: 17 }, power: 1 }))).toBeGreaterThanOrEqual(220);
    expect(flightMs(spec({ to: { x: 30, y: -40 }, power: 0 }))).toBeLessThanOrEqual(1100);
  });
});

describe('the flight', () => {
  it('starts at the ball and ends at the target', () => {
    const s = spec();
    const first = sampleActionAnimation(s, 0);
    expect(first.ball.x).toBeCloseTo(s.from.x, 5);
    expect(first.ball.y).toBeCloseTo(s.from.y, 5);

    const all = frames(s);
    const last = all[all.length - 1]!.ball;
    expect(last.x).toBeCloseTo(s.to.x, 1);
    expect(last.y).toBeCloseTo(s.to.y, 1);
  });

  it('arcs up and comes back down', () => {
    const s = spec({ peakHeight: 4 });
    const travel = flightMs(s);
    const mid = sampleActionAnimation(s, travel / 2).ball.h;
    const start = sampleActionAnimation(s, 0).ball.h;
    expect(mid).toBeGreaterThan(start);
    expect(mid).toBeGreaterThan(2);
  });

  it('stays on the ground for a ground pass', () => {
    const s = spec({ peakHeight: 0, outcome: 'complete', goal: false });
    for (const f of frames(s)) expect(f.ball.h).toBeLessThan(0.5);
  });

  it('keeps every coordinate finite for every outcome', () => {
    for (const outcome of OUTCOMES) {
      for (const f of frames(spec({ outcome, goal: outcome === 'goal' }))) {
        expect(Number.isFinite(f.ball.x)).toBe(true);
        expect(Number.isFinite(f.ball.y)).toBe(true);
        expect(Number.isFinite(f.ball.h)).toBe(true);
      }
    }
  });

  it('always finishes', () => {
    for (const outcome of OUTCOMES) {
      const all = frames(spec({ outcome, goal: outcome === 'goal' }));
      expect(all[all.length - 1]!.done).toBe(true);
    }
  });
});

describe('trail', () => {
  it('follows the ball while it travels and stops once it arrives', () => {
    const s = spec();
    const travel = flightMs(s);
    expect(sampleActionAnimation(s, travel * 0.5).trail.length).toBeGreaterThan(0);
    expect(sampleActionAnimation(s, travel + 200).trail).toHaveLength(0);
  });

  it('trails behind the ball, never ahead', () => {
    const s = spec();
    const f = sampleActionAnimation(s, flightMs(s) * 0.6);
    // Ball moves towards smaller y; trail should be at larger (or equal) y.
    for (const ghost of f.trail) expect(ghost.y).toBeGreaterThanOrEqual(f.ball.y - 0.01);
  });
});

describe('impact feedback', () => {
  it('bulges the net only on a goal, and only once the ball arrives', () => {
    const s = spec({ outcome: 'goal', goal: true });
    const travel = flightMs(s);
    expect(sampleActionAnimation(s, travel * 0.5).netImpact).toBeNull();
    expect(sampleActionAnimation(s, travel + 20).netImpact).not.toBeNull();
    expect(sampleActionAnimation(spec({ outcome: 'saved', goal: false }), travel + 20).netImpact)
      .toBeNull();
  });

  const shakeMag = (f: { shakeX: number; shakeY: number }) => Math.hypot(f.shakeX, f.shakeY);

  it('shakes harder for a goal than for a pass', () => {
    // Peak magnitude across the aftermath, so the oscillation phase does not
    // decide the comparison.
    const peak = (s: ActionAnimationSpec) =>
      Math.max(...frames(s).map(shakeMag));
    const goal = peak(spec({ goal: true }));
    const pass = peak(spec({ goal: false, outcome: 'complete', peakHeight: 0 }));
    expect(goal).toBeGreaterThan(pass);
  });

  it('settles the shake to nothing', () => {
    const all = frames(spec({ goal: true }));
    expect(shakeMag(all[all.length - 1]!)).toBeLessThan(0.02);
  });

  it('flashes on a goal and fades', () => {
    const s = spec({ goal: true });
    const travel = flightMs(s);
    expect(sampleActionAnimation(s, travel * 0.5).flash).toBe(0);
    expect(sampleActionAnimation(s, travel + 5).flash).toBeGreaterThan(0.5);
    expect(sampleActionAnimation(s, travel + 400).flash).toBe(0);
  });

  it('kicks up turf on a struck ball, then lets it fall', () => {
    const early = sampleActionAnimation(spec({ peakHeight: 3 }), 30);
    expect(early.turf.length).toBeGreaterThan(0);
    expect(sampleActionAnimation(spec({ peakHeight: 3 }), 800).turf).toHaveLength(0);
  });

  it('does not kick turf for a ball rolled along the ground', () => {
    expect(sampleActionAnimation(spec({ peakHeight: 0 }), 30).turf).toHaveLength(0);
  });
});
