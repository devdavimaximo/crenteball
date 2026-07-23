import { describe, expect, it } from 'vitest';

import {
  angleToGoal,
  clampToPitch,
  directionTo,
  distance,
  distanceToGoal,
  distanceToSegment,
  HALF_WIDTH,
  isInsideBox,
  PITCH_LENGTH,
} from './pitch';

describe('distances', () => {
  it('measures a straight line', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('measures the distance to goal from the goal centre', () => {
    expect(distanceToGoal({ x: 0, y: 0 })).toBe(0);
    expect(distanceToGoal({ x: 0, y: 11 })).toBe(11);
    expect(distanceToGoal({ x: 6, y: 8 })).toBe(10);
  });
});

describe('angleToGoal', () => {
  it('is zero straight in front of goal', () => {
    expect(angleToGoal({ x: 0, y: 16 })).toBe(0);
  });

  it('is positive to the right, negative to the left', () => {
    expect(angleToGoal({ x: 10, y: 10 })).toBeGreaterThan(0);
    expect(angleToGoal({ x: -10, y: 10 })).toBeLessThan(0);
  });

  it('is symmetric', () => {
    expect(angleToGoal({ x: 8, y: 12 })).toBeCloseTo(-angleToGoal({ x: -8, y: 12 }), 6);
  });

  it('never divides by zero on the goal line', () => {
    expect(Number.isFinite(angleToGoal({ x: 5, y: 0 }))).toBe(true);
  });
});

describe('isInsideBox', () => {
  it('accepts a point in the penalty area', () => {
    expect(isInsideBox({ x: 0, y: 10 })).toBe(true);
    expect(isInsideBox({ x: 15, y: 5 })).toBe(true);
  });

  it('rejects a point beyond the box', () => {
    expect(isInsideBox({ x: 0, y: 20 })).toBe(false);
    expect(isInsideBox({ x: 25, y: 5 })).toBe(false);
  });
});

describe('clampToPitch', () => {
  it('pulls a point in the stands back onto the grass', () => {
    expect(clampToPitch({ x: 100, y: -5 })).toEqual({ x: HALF_WIDTH, y: 0 });
    expect(clampToPitch({ x: -100, y: 200 })).toEqual({ x: -HALF_WIDTH, y: PITCH_LENGTH });
  });

  it('leaves a valid point untouched', () => {
    expect(clampToPitch({ x: 5, y: 20 })).toEqual({ x: 5, y: 20 });
  });
});

describe('directionTo', () => {
  it('returns a unit vector', () => {
    const d = directionTo({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 6);
    expect(d).toEqual({ x: 0.6, y: 0.8 });
  });

  it('falls back towards goal for a zero-length direction', () => {
    expect(directionTo({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 0, y: -1 });
  });
});

describe('distanceToSegment', () => {
  it('is zero for a point on the line', () => {
    expect(distanceToSegment({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(0, 6);
  });

  it('measures perpendicular distance to a passing lane', () => {
    // A defender 3m to the side of a straight pass.
    expect(distanceToSegment({ x: 3, y: 5 }, { x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(3, 6);
  });

  it('clamps to the endpoints, not the infinite line', () => {
    // Past the end of the segment: distance is to the nearer endpoint.
    expect(distanceToSegment({ x: 0, y: 15 }, { x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(5, 6);
  });
});
