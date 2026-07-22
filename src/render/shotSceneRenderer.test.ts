import { describe, expect, it } from 'vitest';

import { CanvasShotRenderer } from './shotSceneRenderer';
import type { ShotScene } from './types';

/**
 * A recording stand-in for CanvasRenderingContext2D.
 *
 * Not a rendering test — "does it look good" needs eyes, at `#render`. What
 * this catches mechanically is the failure class that eyes are bad at
 * noticing the cause of: NaN coordinates, drawing that exploded off-frame,
 * a renderer that silently drew nothing.
 */
function recordingContext() {
  const coordinates: number[] = [];
  const calls: string[] = [];

  const record =
    (name: string, coordinateArgs: number[] = []) =>
    (...args: unknown[]) => {
      calls.push(name);
      for (const index of coordinateArgs) {
        const value = args[index];
        if (typeof value === 'number') coordinates.push(value);
      }
    };

  const ctx = {
    setTransform: record('setTransform'),
    fillRect: record('fillRect', [0, 1, 2, 3]),
    beginPath: record('beginPath'),
    moveTo: record('moveTo', [0, 1]),
    lineTo: record('lineTo', [0, 1]),
    arc: record('arc', [0, 1, 2]),
    roundRect: record('roundRect', [0, 1, 2, 3]),
    fill: record('fill'),
    stroke: record('stroke'),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    set fillStyle(_: unknown) {},
    set strokeStyle(_: unknown) {},
    set lineWidth(_: unknown) {},
    set lineCap(_: unknown) {},
  };

  return { ctx, coordinates, calls };
}

function fakeCanvas(ctx: unknown): HTMLCanvasElement {
  return { getContext: () => ctx, width: 0, height: 0 } as unknown as HTMLCanvasElement;
}

const SCENES: ShotScene[] = [
  // The extremes of what the moment generator produces (M3.1 geometry).
  {
    distance: 3,
    angle: -28,
    defenders: [],
    keeperX: 0,
    aim: null,
    ballMark: null,
    kit: { primary: '#c8102e', secondary: '#101010' },
  },
  {
    distance: 11,
    angle: 0,
    defenders: [],
    keeperX: 0.5,
    aim: { x: 0.7, y: 0.2, spreadM: 0.6 },
    ballMark: null,
    kit: { primary: '#c8102e', secondary: '#101010' },
  },
  {
    distance: 45,
    angle: 44,
    defenders: [
      { x: -2, depth: 10 },
      { x: 1, depth: 20 },
      { x: 0, depth: 30 },
    ],
    keeperX: -0.8,
    aim: { x: -0.9, y: 0.9, spreadM: 2.4 },
    // A wild miss: the mark must render even well outside the frame.
    ballMark: { x: -6.2, y: 3.1 },
    kit: { primary: '#0b3d91', secondary: '#f2f2f2' },
  },
];

describe('CanvasShotRenderer', () => {
  it('renders every extreme scene without a single non-finite coordinate', () => {
    for (const scene of SCENES) {
      const { ctx, coordinates } = recordingContext();
      const renderer = new CanvasShotRenderer();
      renderer.mount(fakeCanvas(ctx));
      renderer.resize(360, 640, 2);
      renderer.render(scene);

      expect(coordinates.length).toBeGreaterThan(50);
      for (const value of coordinates) {
        expect(Number.isFinite(value), `dist ${String(scene.distance)}m`).toBe(true);
      }
      renderer.destroy();
    }
  });

  it('draws the reticle only while aiming', () => {
    const withAim = recordingContext();
    const withoutAim = recordingContext();

    const renderer = new CanvasShotRenderer();
    renderer.mount(fakeCanvas(withAim.ctx));
    renderer.resize(360, 640, 1);
    renderer.render(SCENES[1] as ShotScene);

    renderer.mount(fakeCanvas(withoutAim.ctx));
    renderer.render(SCENES[0] as ShotScene);

    expect(withAim.calls.filter((c) => c === 'arc').length).toBeGreaterThan(
      withoutAim.calls.filter((c) => c === 'arc').length,
    );
  });

  it('survives render before mount and after destroy', () => {
    const renderer = new CanvasShotRenderer();
    expect(() => renderer.render(SCENES[0] as ShotScene)).not.toThrow();

    const { ctx } = recordingContext();
    renderer.mount(fakeCanvas(ctx));
    renderer.destroy();
    expect(() => renderer.render(SCENES[0] as ShotScene)).not.toThrow();
  });

  it('scales the backing store by the device pixel ratio', () => {
    const { ctx } = recordingContext();
    const canvas = fakeCanvas(ctx);
    const renderer = new CanvasShotRenderer();
    renderer.mount(canvas);
    renderer.resize(360, 640, 3);

    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1920);
  });
});
