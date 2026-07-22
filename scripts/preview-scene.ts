/**
 * Renders match scenes to PNG, headlessly.
 *
 * Art direction cannot be done blind. This runs the real `CanvasShotRenderer`
 * against a Node canvas so a scene can be looked at — on a phone-sized frame
 * and a desktop one — without a browser, a device, or a guess.
 *
 * Output lands in `.preview/` (gitignored). Regenerate after any change to
 * the renderer and actually look at the files.
 *
 *   npm run preview
 */
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HAIR_STYLES, randomAppearance } from '@/engine/domain/appearance';
import { createRng } from '@/engine/rng';
import { drawAthlete } from '@/render/athlete';
import { GRASS, SKY } from '@/render/palette';
import { sampleShotAnimation, shotFlightMs } from '@/render/shotAnimation';
import { CanvasShotRenderer } from '@/render/shotSceneRenderer';
import type { ShotScene } from '@/render/types';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.preview');

const KIT = { primary: '#c8102e', secondary: '#101010' };

interface Preview {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly scene: ShotScene;
}

const base = {
  keeperX: 0.3,
  aim: null,
  ballMark: null,
  ballFlight: null,
  keeperPose: null,
  effects: null,
  kit: KIT,
} as const;

const PREVIEWS: readonly Preview[] = [
  {
    name: '01-penalty-phone',
    width: 390,
    height: 780,
    scene: { ...base, distance: 11, angle: 0, defenders: [] },
  },
  {
    name: '02-box-edge-phone',
    width: 390,
    height: 780,
    scene: {
      ...base,
      distance: 17,
      angle: 18,
      defenders: [
        { x: 0.4, depth: 6 },
        { x: -1.8, depth: 9 },
      ],
      aim: { x: 0.62, y: 0.28, spreadM: 0.9 },
    },
  },
  {
    name: '03-close-range-phone',
    width: 390,
    height: 780,
    scene: { ...base, distance: 6, angle: -14, defenders: [{ x: -1.2, depth: 3 }] },
  },
  {
    name: '04-long-range-phone',
    width: 390,
    height: 780,
    scene: {
      ...base,
      distance: 29,
      angle: -26,
      defenders: [
        { x: -2.4, depth: 8 },
        { x: 0.9, depth: 13 },
        { x: -0.4, depth: 18 },
      ],
    },
  },
  {
    name: '05-goal-moment-phone',
    width: 390,
    height: 780,
    scene: {
      ...base,
      distance: 14,
      angle: 8,
      defenders: [{ x: -0.8, depth: 5 }],
      ballFlight: { x: 2.6, y: 1.1, metresFromGoal: -0.3, alpha: 1 },
      keeperPose: { dive: 0.85, stretch: 1 },
    },
  },
  {
    name: '06-box-edge-desktop',
    width: 1280,
    height: 720,
    scene: {
      ...base,
      distance: 17,
      angle: 18,
      defenders: [
        { x: 0.4, depth: 6 },
        { x: -1.8, depth: 9 },
      ],
      aim: { x: 0.62, y: 0.28, spreadM: 0.9 },
    },
  },
];

/**
 * Frames sampled from a real goal animation, so the juice is judged from
 * what actually plays rather than from hand-written effect values.
 */
function goalFrames(): Preview[] {
  const spec = {
    distance: 15,
    angle: 6,
    targetX: 2.5,
    targetY: 1.15,
    outcome: 'goal',
    power: 0.7,
    keeperX: 0.3,
    blockDepth: 5,
  } as const;

  const flight = shotFlightMs(spec.distance, spec.power);

  return [
    ['08-flight', flight * 0.62],
    ['09-impact', flight + 25],
    ['10-aftermath', flight + 260],
  ].map(([name, at]) => {
    const frame = sampleShotAnimation(spec, at as number);

    return {
      name: name as string,
      width: 390,
      height: 780,
      scene: {
        ...base,
        distance: spec.distance,
        angle: spec.angle,
        defenders: [{ x: -1.4, depth: 5 }],
        ballFlight: { ...frame.ball, alpha: frame.ballAlpha },
        keeperPose: frame.keeper,
        effects: {
          trail: frame.trail,
          netImpact: frame.netImpact,
          turf: frame.turf,
          shakeX: frame.shakeX,
          shakeY: frame.shakeY,
          flash: frame.flash,
        },
      },
    } satisfies Preview;
  });
}

mkdirSync(OUT_DIR, { recursive: true });

for (const preview of [...PREVIEWS, ...goalFrames()]) {
  const canvas = createCanvas(preview.width, preview.height);
  const renderer = new CanvasShotRenderer();

  // The renderer only needs `getContext('2d')`; the Node canvas satisfies it.
  renderer.mount(canvas as unknown as HTMLCanvasElement);
  renderer.resize(preview.width, preview.height, 1);
  renderer.render(preview.scene);

  const file = join(OUT_DIR, `${preview.name}.png`);
  writeFileSync(file, canvas.toBuffer('image/png'));
  console.log(`${preview.name.padEnd(26)} ${preview.width}x${preview.height}`);
}

// ---------------------------------------------------------------- athletes

/**
 * A contact sheet of generated athletes.
 *
 * The only way to tell whether the paper-doll produces a squad or a row of
 * clones is to look at twenty of them side by side.
 */
function renderAthleteSheet(): void {
  const columns = 8;
  const rows = 3;
  const cell = 150;
  const width = columns * cell;
  const height = rows * cell + 90;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;

  ctx.fillStyle = SKY.horizon;
  ctx.fillRect(0, 0, width, height);

  const rng = createRng(20260721);

  // Every hair style, so none is left unverified.
  const forced = [...HAIR_STYLES];

  for (let i = 0; i < columns * rows; i += 1) {
    const appearance = {
      ...randomAppearance(rng),
      ...(i < forced.length ? { hairStyle: forced[i] } : {}),
    };

    const cx = (i % columns) * cell + cell / 2;
    const cy = Math.floor(i / columns) * cell + cell - 14;

    ctx.fillStyle = GRASS.mid;
    ctx.fillRect((i % columns) * cell, Math.floor(i / columns) * cell, cell, cell);

    drawAthlete(ctx, {
      sx: cx,
      groundY: cy,
      scale: (cell - 34) / appearance.height,
      appearance,
      kit: { primary: '#c8102e', secondary: '#f2f2f2' },
      shirtNumber: i + 1,
    });
  }

  // A size ramp: the same athlete from portrait down to a distant defender.
  const ramp = randomAppearance(createRng(99));
  let x = 40;
  for (const pixels of [88, 60, 40, 26, 16, 10]) {
    ctx.fillStyle = GRASS.near;
    ctx.fillRect(x - 30, rows * cell, 64, 90);
    drawAthlete(ctx, {
      sx: x,
      groundY: rows * cell + 84,
      scale: pixels / ramp.height,
      appearance: ramp,
      kit: { primary: '#0b3d91', secondary: '#f0a500' },
      shirtNumber: 9,
    });
    x += 70;
  }

  writeFileSync(join(OUT_DIR, '07-athletes.png'), canvas.toBuffer('image/png'));
  console.log('07-athletes'.padEnd(26), `${String(width)}x${String(height)}`);
}

renderAthleteSheet();

console.log(`\n${String(PREVIEWS.length + 1)} previews em .preview/`);
