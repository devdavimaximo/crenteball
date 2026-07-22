import { describe, expect, it } from 'vitest';

import { unprojectAtDepth, cameraFor, depthOf, project } from '@/render/projection';

import { defaultSwipeConfig, previewSwipe, readSwipe } from './shotControl';
import type { SwipeSample } from './shotControl';

const CONFIG = defaultSwipeConfig(640);

/** A straight swipe as evenly spaced samples. */
function swipe(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  durationMs: number,
  steps = 8,
): SwipeSample[] {
  return Array.from({ length: steps + 1 }, (_, i) => ({
    x: fromX + ((toX - fromX) * i) / steps,
    y: fromY + ((toY - fromY) * i) / steps,
    t: (durationMs * i) / steps,
  }));
}

describe('readSwipe', () => {
  it('rejects a tap', () => {
    expect(readSwipe([{ x: 180, y: 500, t: 0 }], CONFIG)).toBeNull();
    expect(readSwipe(swipe(180, 500, 183, 496, 80), CONFIG)).toBeNull();
  });

  it('rejects a hesitation shorter than the threshold', () => {
    const tooShort = swipe(180, 500, 180, 500 - CONFIG.minLengthPx * 0.8, 120);
    expect(readSwipe(tooShort, CONFIG)).toBeNull();
  });

  it('accepts a committed swipe and reports where it ended', () => {
    const reading = readSwipe(swipe(180, 520, 220, 180, 160), CONFIG);
    expect(reading).not.toBeNull();
    expect(reading?.endX).toBe(220);
    expect(reading?.endY).toBe(180);
  });

  it('maps a faster swipe to more power', () => {
    const slow = readSwipe(swipe(180, 520, 180, 200, 400), CONFIG);
    const fast = readSwipe(swipe(180, 520, 180, 200, 90), CONFIG);
    expect(fast?.power ?? 0).toBeGreaterThan(slow?.power ?? 0);
  });

  it('clamps power to 1 for a violent flick', () => {
    const flick = readSwipe(swipe(180, 520, 180, 100, 20), CONFIG);
    expect(flick?.power).toBe(1);
  });

  it('never strikes softer than the floor', () => {
    const crawl = readSwipe(swipe(180, 520, 180, 400, 5000), CONFIG);
    expect(crawl?.power).toBe(CONFIG.minPower);
  });

  it('measures the path, not the displacement, so a curved swipe counts fully', () => {
    // Out and back: near-zero displacement, plenty of path.
    const there = swipe(180, 520, 180, 300, 100, 4);
    const back = swipe(180, 300, 180, 500, 100, 4).map((s) => ({ ...s, t: s.t + 100 }));
    const reading = readSwipe([...there, ...back], CONFIG);
    expect(reading).not.toBeNull();
  });

  it('survives duplicate timestamps without dividing by zero', () => {
    const samples = swipe(180, 520, 180, 200, 0);
    const reading = readSwipe(samples, CONFIG);
    expect(reading?.power).toBe(1);
  });
});

describe('previewSwipe', () => {
  it('always returns something to draw mid-gesture', () => {
    const preview = previewSwipe([{ x: 100, y: 400, t: 0 }], CONFIG);
    expect(preview.endX).toBe(100);
    expect(preview.power).toBe(CONFIG.minPower);
  });

  it('agrees with the final reading once the swipe is long enough', () => {
    const samples = swipe(180, 520, 220, 180, 160);
    expect(previewSwipe(samples, CONFIG)).toEqual(readSwipe(samples, CONFIG));
  });
});

describe('unprojectAtDepth — the finger becomes an aim', () => {
  it('is the exact inverse of project, at every angle the camera turns to', () => {
    // The control depends on this being exact. A yaw makes the goal plane
    // oblique to the view axis, so the inverse is a ray-plane intersection
    // rather than a division — and an error here would quietly send every
    // angled shot somewhere other than where the player aimed.
    const viewport = { width: 360, height: 640 };

    for (const angle of [-40, -22, -8, 0, 8, 22, 40]) {
      for (const distance of [7, 16, 31]) {
        const camera = cameraFor(distance, angle, viewport);
        const depth = depthOf(0, distance, camera);

        for (const [x, y] of [
          [0, 1.2],
          [-3.2, 0.3],
          [3.6, 2.4],
        ] as const) {
          const screen = project(x, y, depth, camera, viewport);
          const world = unprojectAtDepth(screen.sx, screen.sy, depth, camera, viewport);

          const label = `${String(distance)}m @${String(angle)}deg`;
          expect(world.x, label).toBeCloseTo(x, 5);
          expect(world.y, label).toBeCloseTo(y, 5);
        }
      }
    }
  });

  it('turns the camera towards the goal, never away from it', () => {
    const viewport = { width: 360, height: 640 };
    expect(cameraFor(20, 0, viewport).yaw).toBeCloseTo(0, 6);
    expect(cameraFor(20, 30, viewport).yaw).toBeGreaterThan(0);
    expect(cameraFor(20, -30, viewport).yaw).toBeLessThan(0);
  });

  it('splits the offset instead of centring one and losing the other', () => {
    // The whole point of turning half way: neither the goal nor the ball
    // ends up pinned to an edge.
    const viewport = { width: 360, height: 640 };
    const camera = cameraFor(26, 34, viewport);
    const goalDepth = depthOf(0, 26, camera);

    const goal = project(0, 0, goalDepth, camera, viewport);
    const ball = project(camera.x, 0, camera.backOff, camera, viewport);

    expect(goal.sx).toBeLessThan(viewport.width / 2);
    expect(ball.sx).toBeGreaterThan(viewport.width / 2);
    expect(goal.sx).toBeGreaterThan(0);
    expect(ball.sx).toBeLessThan(viewport.width);
  });
});
