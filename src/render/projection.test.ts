import { describe, expect, it } from 'vitest';

import { GOAL_HALF_WIDTH } from '@/engine/balance/shot';

import { ballWorldX, cameraFor, depthOf, project } from './projection';
import type { Viewport } from './projection';

const PHONE: Viewport = { width: 360, height: 640 };
const DESKTOP: Viewport = { width: 1280, height: 720 };

function goalWidthPx(distance: number, viewport: Viewport): number {
  const camera = cameraFor(distance, 0, viewport);
  const depth = depthOf(0, distance, camera);
  const left = project(-GOAL_HALF_WIDTH, 0, depth, camera, viewport);
  const right = project(GOAL_HALF_WIDTH, 0, depth, camera, viewport);
  return right.sx - left.sx;
}

describe('perspective basics', () => {
  it('draws nearer things bigger', () => {
    const camera = cameraFor(20, 0, PHONE);
    const near = project(0, 0, 6, camera, PHONE);
    const far = project(0, 0, 24, camera, PHONE);
    expect(near.scale).toBeGreaterThan(far.scale);
  });

  it('keeps the ground below the horizon', () => {
    const camera = cameraFor(20, 0, PHONE);
    for (const depth of [2, 8, 15, 25]) {
      expect(project(0, 0, depth, camera, PHONE).sy).toBeGreaterThan(camera.horizonY);
    }
  });

  it('puts higher points higher on screen', () => {
    const camera = cameraFor(15, 0, PHONE);
    const ground = project(0, 0, 18, camera, PHONE);
    const crossbar = project(0, 2.44, 18, camera, PHONE);
    expect(crossbar.sy).toBeLessThan(ground.sy);
  });

  it('never explodes for points at or behind the camera', () => {
    const camera = cameraFor(10, 0, PHONE);
    const projected = project(0, 0, -3, camera, PHONE);
    expect(Number.isFinite(projected.sx)).toBe(true);
    expect(Number.isFinite(projected.sy)).toBe(true);
  });
});

describe('the goal on screen', () => {
  it('shrinks with shot distance', () => {
    expect(goalWidthPx(8, PHONE)).toBeGreaterThan(goalWidthPx(30, PHONE));
  });

  it('fills a generous share of a phone screen at every range', () => {
    // The phone is the primary target, so this is where the goal has to be
    // commanding.
    for (const distance of [3, 8, 16, 30, 45]) {
      const width = goalWidthPx(distance, PHONE);
      expect(width, `${String(distance)}m`).toBeGreaterThan(PHONE.width * 0.28);
      expect(width, `${String(distance)}m`).toBeLessThan(PHONE.width * 0.98);
    }
  });

  it('stays readable on a wide screen, where the vertical budget rules', () => {
    // On a landscape viewport the lens is capped by the frame's height, so
    // the goal is deliberately smaller than on a phone — desktop is the
    // adaptation, not the target.
    for (const distance of [3, 8, 16, 30, 45]) {
      const width = goalWidthPx(distance, DESKTOP);
      expect(width, `${String(distance)}m`).toBeGreaterThan(DESKTOP.width * 0.12);
      expect(width, `${String(distance)}m`).toBeLessThan(DESKTOP.width * 0.98);
    }
  });

  it('is centred for a straight shot', () => {
    const camera = cameraFor(16, 0, PHONE);
    const depth = depthOf(0, 16, camera);
    const centre = project(0, 0, depth, camera, PHONE);
    expect(centre.sx).toBeCloseTo(PHONE.width / 2, 5);
  });

  it('shifts opposite to the shooter for an angled shot', () => {
    // Shooter to the right of the goal: the goal appears to his left.
    const camera = cameraFor(16, 30, PHONE);
    const depth = depthOf(0, 16, camera);
    const centre = project(0, 0, depth, camera, PHONE);
    expect(centre.sx).toBeLessThan(PHONE.width / 2);
  });

  it('is symmetric in the shot angle', () => {
    const left = cameraFor(16, -25, PHONE);
    const right = cameraFor(16, 25, PHONE);
    const depthL = depthOf(0, 16, left);
    const depthR = depthOf(0, 16, right);
    const goalL = project(0, 0, depthL, left, PHONE);
    const goalR = project(0, 0, depthR, right, PHONE);
    expect(goalL.sx - PHONE.width / 2).toBeCloseTo(-(goalR.sx - PHONE.width / 2), 5);
  });
});

describe('world helpers', () => {
  it('places a straight shot on the centre line', () => {
    expect(ballWorldX(20, 0)).toBe(0);
  });

  it('offsets the ball laterally with the angle', () => {
    expect(ballWorldX(20, 30)).toBeCloseTo(10, 5);
    expect(ballWorldX(20, -30)).toBeCloseTo(-10, 5);
  });

  it('measures depth from the camera, not the ball', () => {
    // backOff is solved from the composition, not fixed, so the assertions
    // are about the relationship rather than a magic number.
    const camera = cameraFor(20, 0, PHONE);
    expect(depthOf(0, 20, camera)).toBeCloseTo(20 + camera.backOff, 6);
    expect(depthOf(20, 20, camera)).toBeCloseTo(camera.backOff, 6);
    expect(depthOf(8, 20, camera)).toBeGreaterThan(depthOf(20, 20, camera));
  });

  it('keeps the camera a plausible distance behind the ball at any range', () => {
    for (const distance of [3, 8, 16, 30, 45]) {
      const camera = cameraFor(distance, 0, PHONE);
      expect(camera.backOff, `${String(distance)}m`).toBeGreaterThanOrEqual(1.2);
      expect(camera.backOff, `${String(distance)}m`).toBeLessThanOrEqual(9);
    }
  });

  it('lands the ball near the bottom of the frame at every range', () => {
    // The composition rule that stopped half the screen being empty grass.
    for (const viewport of [PHONE, DESKTOP]) {
      for (const distance of [3, 8, 16, 30, 45]) {
        const camera = cameraFor(distance, 0, viewport);
        const ball = project(0, 0, depthOf(distance, distance, camera), camera, viewport);
        expect(ball.sy / viewport.height, `${String(distance)}m`).toBeGreaterThan(0.55);
        expect(ball.sy / viewport.height, `${String(distance)}m`).toBeLessThan(1);
      }
    }
  });

  it('keeps the whole goal in frame even at the widest angle', () => {
    // Angled shots used to push the far post clean off the left edge.
    for (const viewport of [PHONE, DESKTOP]) {
      for (const angle of [-45, -30, -15, 0, 15, 30, 45]) {
        for (const distance of [8, 20, 40]) {
          const camera = cameraFor(distance, angle, viewport);
          const depth = depthOf(0, distance, camera);
          const left = project(-GOAL_HALF_WIDTH, 0, depth, camera, viewport);
          const right = project(GOAL_HALF_WIDTH, 0, depth, camera, viewport);

          const label = `${String(distance)}m @${String(angle)}deg`;
          expect(left.sx, label).toBeGreaterThanOrEqual(0);
          expect(right.sx, label).toBeLessThanOrEqual(viewport.width);
        }
      }
    }
  });
});
