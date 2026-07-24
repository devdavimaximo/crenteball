import { describe, expect, it } from 'vitest';

import { topDownCamera } from '@/render/topdown';
import type { Viewport } from '@/render/topdown';

import { defaultSlingConfig, previewSling, readSling } from './slingControl';
import type { ScreenPoint } from './slingControl';

const PHONE: Viewport = { width: 390, height: 780 };
const CAM = topDownCamera({ x: 0, y: 16 }, PHONE);
const CONFIG = defaultSlingConfig(PHONE.height);

const at = (x: number, y: number): ScreenPoint => ({ x, y });

describe('the ball goes opposite the pull', () => {
  it('pulling down launches up the pitch (towards goal)', () => {
    // Ball is up-screen towards goal; pulling the finger downward fires up.
    const reading = readSling(at(195, 500), at(195, 640), CAM, CONFIG);
    expect(reading).not.toBeNull();
    // Up the pitch is smaller y — the launch dir.y is negative.
    expect(reading!.dir.y).toBeLessThan(0);
    expect(reading!.dir.x).toBeCloseTo(0, 5);
  });

  it('pulling right launches left', () => {
    const reading = readSling(at(200, 500), at(320, 500), CAM, CONFIG);
    expect(reading!.dir.x).toBeLessThan(0);
  });

  it('pulling up-left launches down-right', () => {
    const reading = readSling(at(200, 500), at(120, 420), CAM, CONFIG);
    expect(reading!.dir.x).toBeGreaterThan(0);
    expect(reading!.dir.y).toBeGreaterThan(0);
  });

  it('returns a unit direction', () => {
    const reading = readSling(at(200, 500), at(140, 610), CAM, CONFIG);
    expect(Math.hypot(reading!.dir.x, reading!.dir.y)).toBeCloseTo(1, 6);
  });
});

describe('power scales with the pull', () => {
  it('a longer pull is more power', () => {
    const soft = readSling(at(195, 500), at(195, 560), CAM, CONFIG);
    const hard = readSling(at(195, 500), at(195, 720), CAM, CONFIG);
    expect(hard!.power).toBeGreaterThan(soft!.power);
  });

  it('caps at full power for a huge pull', () => {
    const reading = readSling(at(195, 400), at(195, 780), CAM, CONFIG);
    expect(reading!.power).toBe(1);
  });

  it('never launches below the floor', () => {
    // Just past the cancel threshold.
    const reading = readSling(at(195, 500), at(195, 500 + CONFIG.minDragPx + 1), CAM, CONFIG);
    expect(reading!.power).toBeGreaterThanOrEqual(CONFIG.minPower);
  });
});

describe('cancelling', () => {
  it('a tap is not a shot', () => {
    expect(readSling(at(195, 500), at(196, 501), CAM, CONFIG)).toBeNull();
  });

  it('a twitch shorter than the threshold cancels', () => {
    const short = CONFIG.minDragPx * 0.6;
    expect(readSling(at(195, 500), at(195, 500 + short), CAM, CONFIG)).toBeNull();
  });
});

describe('the depth axis is undone correctly', () => {
  it('a straight-up pull points straight up the pitch, not skewed', () => {
    // The camera squashes depth; the control must invert that, or a vertical
    // pull would send the ball off at an angle.
    const reading = readSling(at(195, 500), at(195, 700), CAM, CONFIG);
    expect(reading!.dir.x).toBeCloseTo(0, 6);
    expect(reading!.dir.y).toBe(-1);
  });

  it('equal screen pulls across and along give different pitch angles', () => {
    // Because depth is compressed, the same pixels of vertical pull cover more
    // pitch than horizontal — the launch angle reflects that.
    const across = readSling(at(195, 500), at(295, 500), CAM, CONFIG);
    const along = readSling(at(195, 500), at(195, 600), CAM, CONFIG);
    // Across is purely lateral, along is purely forward.
    expect(Math.abs(across!.dir.x)).toBeCloseTo(1, 5);
    expect(Math.abs(along!.dir.y)).toBeCloseTo(1, 5);
  });
});

describe('previewSling', () => {
  it('always returns an arrow to draw, even for a tiny pull', () => {
    const reading = previewSling(at(195, 500), at(196, 505), CAM, CONFIG);
    expect(reading.power).toBe(CONFIG.minPower);
    expect(Math.hypot(reading.dir.x, reading.dir.y)).toBeCloseTo(1, 6);
  });

  it('agrees with the final reading once the pull is long enough', () => {
    const start = at(200, 500);
    const current = at(140, 640);
    const preview = previewSling(start, current, CAM, CONFIG);
    const final = readSling(start, current, CAM, CONFIG);
    expect(preview.dir).toEqual(final!.dir);
    expect(preview.power).toEqual(final!.power);
  });
});
