import { describe, expect, it } from 'vitest';

import {
  heightPx,
  project,
  projectGround,
  topDownCamera,
  unprojectGround,
} from './topdown';
import type { Viewport } from './topdown';

const PHONE: Viewport = { width: 390, height: 780 };

const ball = { x: 0, y: 16 };

describe('the ball is followed', () => {
  it('centres the followed point horizontally and anchors it low', () => {
    const cam = topDownCamera(ball, PHONE);
    const p = projectGround(ball, cam);
    expect(p.sx).toBeCloseTo(PHONE.width / 2, 6);
    expect(p.sy).toBeCloseTo(cam.anchorY, 6);
    // Anchored in the lower part of the frame, leaving the pitch ahead visible.
    expect(p.sy).toBeGreaterThan(PHONE.height * 0.55);
  });
});

describe('the goal is up, the player is down', () => {
  it('puts a point nearer the goal higher on screen', () => {
    const cam = topDownCamera(ball, PHONE);
    const nearGoal = projectGround({ x: 0, y: 4 }, cam);
    const deep = projectGround({ x: 0, y: 30 }, cam);
    expect(nearGoal.sy).toBeLessThan(deep.sy);
  });

  it('puts a point to the right further right on screen', () => {
    const cam = topDownCamera(ball, PHONE);
    expect(projectGround({ x: 10, y: 16 }, cam).sx).toBeGreaterThan(PHONE.width / 2);
    expect(projectGround({ x: -10, y: 16 }, cam).sx).toBeLessThan(PHONE.width / 2);
  });
});

describe('height', () => {
  it('lifts a point off the ground upward', () => {
    const cam = topDownCamera(ball, PHONE);
    const foot = project(0, 16, 0, cam);
    const head = project(0, 16, 1.8, cam);
    expect(head.sy).toBeLessThan(foot.sy);
    expect(foot.sx).toBeCloseTo(head.sx, 6);
  });

  it('reports a plausible on-screen height for a person', () => {
    const cam = topDownCamera(ball, PHONE);
    const px = heightPx(1.8, cam);
    // A footballer should read as a figure, not a speck or a giant.
    expect(px).toBeGreaterThan(10);
    expect(px).toBeLessThan(40);
  });
});

describe('depth is compressed, not width', () => {
  it('squashes the along-pitch axis relative to across', () => {
    const cam = topDownCamera(ball, PHONE);
    const acrossSpan = projectGround({ x: 10, y: 16 }, cam).sx - projectGround({ x: 0, y: 16 }, cam).sx;
    const alongSpan = projectGround({ x: 0, y: 26 }, cam).sy - projectGround({ x: 0, y: 16 }, cam).sy;
    // Ten metres along the pitch covers fewer pixels than ten across.
    expect(alongSpan).toBeLessThan(acrossSpan);
  });
});

describe('unproject is the inverse of project on the ground', () => {
  it('round-trips a ground point exactly', () => {
    const cam = topDownCamera({ x: 4, y: 20 }, PHONE);
    for (const p of [
      { x: 0, y: 0 },
      { x: -12, y: 8 },
      { x: 9, y: 30 },
      { x: 20, y: 45 },
    ]) {
      const screen = projectGround(p, cam);
      const world = unprojectGround(screen.sx, screen.sy, cam);
      expect(world.x).toBeCloseTo(p.x, 6);
      expect(world.y).toBeCloseTo(p.y, 6);
    }
  });
});

describe('framing shows the useful area', () => {
  it('keeps the goal in frame from a typical shooting position', () => {
    const cam = topDownCamera({ x: 0, y: 18 }, PHONE);
    const goal = projectGround({ x: 0, y: 0 }, cam);
    expect(goal.sy).toBeGreaterThan(0);
    expect(goal.sy).toBeLessThan(PHONE.height);
  });

  it('shows a sensible slice of the pitch width', () => {
    const cam = topDownCamera({ x: 0, y: 18 }, PHONE);
    // How many metres of width fill the phone — enough to see teammates,
    // not so much that everyone is an ant.
    const metresWide = PHONE.width / cam.scale;
    expect(metresWide).toBeGreaterThan(18);
    expect(metresWide).toBeLessThan(38);
  });
});
