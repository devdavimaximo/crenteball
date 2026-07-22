/**
 * Drawing an athlete.
 *
 * The paper-doll, generated: skin, kit, shorts, socks, boots, hair and beard
 * are layers composed in code from an `Appearance`. No image assets, and the
 * same function draws a 20-pixel defender in the distance and a full-height
 * portrait — detail is dropped below the scale where it would be mud.
 *
 * Everything is expressed as a fraction of the athlete's height, so a 1.68m
 * winger and a 1.95m centre-back are the same drawing at different
 * proportions rather than two sets of magic numbers.
 */
import type { Appearance } from '@/engine/domain/appearance';

import { HAIR_COLOURS, SKIN_TONES } from './palette';

export interface Kit {
  readonly primary: string;
  readonly secondary: string;
}

export interface AthletePose {
  /** Radians. Used for a keeper's dive. */
  readonly lean?: number;
  /** 0 standing, 1 fully extended — spreads the limbs. */
  readonly stretch?: number;
}

export interface DrawAthleteOptions {
  readonly sx: number;
  readonly groundY: number;
  /** Pixels per metre. */
  readonly scale: number;
  readonly appearance: Appearance;
  readonly kit: Kit;
  readonly shirtNumber?: number;
  readonly pose?: AthletePose;
}

/** Below this many pixels of height, extra layers stop being legible. */
const DETAIL_HEIGHT = 46;
/**
 * Faces need real estate. At 116px tall the eyes came out under a pixel
 * across — noise, not a face. This is the height at which they start to mean
 * something, which in practice is the portrait, not the pitch.
 */
const FACE_HEIGHT = 190;

function shade(hex: string, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const to = amount < 0 ? 0 : 255;
  const mix = Math.abs(amount);

  const channel = (shift: number) => {
    const c = (value >> shift) & 0xff;
    return Math.round(c + (to - c) * mix);
  };

  return `rgb(${String(channel(16))}, ${String(channel(8))}, ${String(channel(0))})`;
}

export function skinColour(appearance: Appearance): string {
  return SKIN_TONES[appearance.skinTone % SKIN_TONES.length] as string;
}

export function hairColour(appearance: Appearance): string {
  return HAIR_COLOURS[appearance.hairColour % HAIR_COLOURS.length] as string;
}

export function drawAthlete(
  ctx: CanvasRenderingContext2D,
  { sx, groundY, scale, appearance, kit, shirtNumber, pose }: DrawAthleteOptions,
): void {
  const h = appearance.height * scale;
  if (h < 4) return;

  const detailed = h >= DETAIL_HEIGHT;
  const faced = h >= FACE_HEIGHT;

  const stretch = pose?.stretch ?? 0;
  const skin = skinColour(appearance);
  const hair = hairColour(appearance);

  // Proportions, all relative to height.
  const shoulder = h * 0.25 * (0.86 + appearance.build * 0.28);
  const hip = h * 0.17 * (0.9 + appearance.build * 0.2);
  const headR = h * 0.062;
  const legTop = h * 0.47;

  ctx.save();
  ctx.translate(sx, groundY);
  if (pose?.lean) ctx.rotate(pose.lean);

  // ---- legs: socks, then shorts over the top -----------------------------
  const legSpread = hip * (0.5 + stretch * 0.5);
  const sockTop = h * 0.2;

  for (const side of [-1, 1]) {
    const legX = side * legSpread * 0.5;

    // Thigh and shin in skin.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.roundRect(legX - hip * 0.22, -legTop, hip * 0.44, legTop - h * 0.03, hip * 0.2);
    ctx.fill();

    // Sock, in the primary colour. Socks, sleeves, shorts and the trim were
    // all the secondary at first, which made every athlete half white.
    ctx.fillStyle = kit.primary;
    ctx.beginPath();
    ctx.roundRect(legX - hip * 0.23, -sockTop, hip * 0.46, sockTop - h * 0.03, hip * 0.16);
    ctx.fill();

    // Boot.
    if (detailed) {
      ctx.fillStyle = '#15181f';
      ctx.beginPath();
      ctx.roundRect(legX - hip * 0.3, -h * 0.038, hip * 0.74, h * 0.038, h * 0.015);
      ctx.fill();
    }
  }

  // Shorts.
  ctx.fillStyle = kit.secondary;
  ctx.beginPath();
  ctx.roundRect(-hip * 0.66, -h * 0.53, hip * 1.32, h * 0.17, hip * 0.18);
  ctx.fill();
  if (detailed) {
    ctx.fillStyle = shade(kit.secondary, -0.15);
    ctx.fillRect(-hip * 0.04, -h * 0.53, hip * 0.08, h * 0.17);
  }

  // ---- torso -------------------------------------------------------------
  const shoulderY = -h * 0.86;
  const waistY = -h * 0.5;

  ctx.fillStyle = kit.primary;
  ctx.beginPath();
  ctx.moveTo(-shoulder / 2, shoulderY);
  ctx.lineTo(shoulder / 2, shoulderY);
  ctx.lineTo(hip * 0.62, waistY);
  ctx.lineTo(-hip * 0.62, waistY);
  ctx.closePath();
  ctx.fill();

  if (detailed) {
    // A narrow trim in the secondary colour: enough to tell two clubs in
    // similar reds apart, without repainting half the shirt.
    ctx.fillStyle = kit.secondary;
    ctx.fillRect(-shoulder * 0.045, shoulderY, shoulder * 0.09, waistY - shoulderY);

    // Shading down the right side, so the torso is not a flat cut-out.
    ctx.fillStyle = shade(kit.primary, -0.16);
    ctx.beginPath();
    ctx.moveTo(shoulder * 0.22, shoulderY);
    ctx.lineTo(shoulder / 2, shoulderY);
    ctx.lineTo(hip * 0.62, waistY);
    ctx.lineTo(hip * 0.24, waistY);
    ctx.closePath();
    ctx.fill();
  }

  // ---- arms --------------------------------------------------------------
  // Hung just outside the shoulder line: centred on it, half of each arm sat
  // inside the torso and the athletes looked armless.
  const armLength = h * 0.36;
  const armW = shoulder * 0.2;
  const armAngle = stretch * 1.2;

  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * (shoulder / 2 + armW * 0.42), shoulderY + armW * 0.55);
    ctx.rotate(side * armAngle);

    // Sleeve, a shade of the primary rather than the secondary.
    ctx.fillStyle = shade(kit.primary, -0.12);
    ctx.beginPath();
    ctx.roundRect(-armW / 2, -armW * 0.5, armW, armLength * 0.4, armW * 0.45);
    ctx.fill();

    // Bare forearm, which is what actually reads as an arm at distance.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.roundRect(-armW * 0.4, armLength * 0.28, armW * 0.8, armLength * 0.66, armW * 0.4);
    ctx.fill();

    ctx.restore();
  }

  // ---- shirt number ------------------------------------------------------
  if (shirtNumber !== undefined && h >= 70) {
    ctx.fillStyle = shade(kit.secondary, 0.75);
    ctx.font = `700 ${String(Math.round(h * 0.11))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(shirtNumber), 0, shoulderY + (waistY - shoulderY) * 0.42);
  }

  // ---- neck and head -----------------------------------------------------
  const headY = shoulderY - headR * 1.05;

  ctx.fillStyle = shade(skin, -0.2);
  ctx.fillRect(-headR * 0.36, shoulderY - headR * 0.9, headR * 0.72, headR * 1.1);

  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, headY, headR, 0, Math.PI * 2);
  ctx.fill();

  if (detailed) drawBeard(ctx, appearance, headY, headR, hair);
  drawHair(ctx, appearance, headY, headR, hair, detailed);

  if (faced) {
    ctx.fillStyle = shade(skin, -0.66);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(
        side * headR * 0.35,
        headY - headR * 0.05,
        headR * 0.13,
        headR * 0.17,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // Brow line: a face without one reads as a doll.
    ctx.strokeStyle = shade(skin, -0.4);
    ctx.lineWidth = Math.max(1, headR * 0.07);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(side * headR * 0.35, headY - headR * 0.28, headR * 0.22, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawHair(
  ctx: CanvasRenderingContext2D,
  appearance: Appearance,
  headY: number,
  headR: number,
  colour: string,
  detailed: boolean,
): void {
  if (appearance.hairStyle === 'bald') return;
  ctx.fillStyle = colour;

  const cap = (thickness: number) => {
    ctx.beginPath();
    ctx.arc(0, headY, headR * thickness, Math.PI * 1.04, Math.PI * 1.96);
    ctx.closePath();
    ctx.fill();
  };

  switch (appearance.hairStyle) {
    case 'buzz':
      cap(1.02);
      break;

    case 'short':
      cap(1.1);
      break;

    case 'curly':
      cap(1.06);
      if (detailed) {
        for (const offset of [-0.62, -0.2, 0.2, 0.62]) {
          ctx.beginPath();
          ctx.arc(headR * offset, headY - headR * 0.72, headR * 0.32, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;

    case 'afro':
      ctx.beginPath();
      ctx.arc(0, headY - headR * 0.34, headR * 1.42, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'long':
      cap(1.1);
      ctx.beginPath();
      ctx.roundRect(-headR * 1.08, headY - headR * 0.3, headR * 2.16, headR * 1.9, headR * 0.5);
      ctx.fill();
      break;

    case 'mohawk':
      ctx.beginPath();
      ctx.roundRect(-headR * 0.2, headY - headR * 1.55, headR * 0.4, headR * 1.1, headR * 0.2);
      ctx.fill();
      break;
  }
}

function drawBeard(
  ctx: CanvasRenderingContext2D,
  appearance: Appearance,
  headY: number,
  headR: number,
  colour: string,
): void {
  if (appearance.beard === 'none') return;

  ctx.save();
  // The jaw only: clipped to the head so a beard never spills off the face.
  ctx.beginPath();
  ctx.arc(0, headY, headR, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = colour;
  ctx.globalAlpha = appearance.beard === 'stubble' ? 0.45 : 1;

  if (appearance.beard === 'goatee') {
    ctx.beginPath();
    ctx.ellipse(0, headY + headR * 0.62, headR * 0.3, headR * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(0, headY + headR * 0.12, headR, 0, Math.PI);
    ctx.fill();
  }

  ctx.restore();
}
