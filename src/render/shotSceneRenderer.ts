/**
 * Canvas 2D implementation of the match renderer.
 *
 * Pure drawing: no React, no game rules, no timers. It draws exactly the
 * scene it is handed, once per `render` call — the frame loop, when M3.5
 * brings animation, lives with whoever owns the scene.
 */
import { GOAL_HALF_WIDTH, GOAL_HEIGHT } from '@/engine/balance/shot';

import { ballWorldX, cameraFor, depthOf, project } from './projection';
import type { Camera, Viewport } from './projection';
import type { MatchRenderer, ShotScene } from './types';

const COLOURS = {
  skyTop: '#060a14',
  skyBottom: '#101830',
  grassA: '#1a7a46',
  grassB: '#15693c',
  line: 'rgba(242, 247, 244, 0.85)',
  goalFrame: '#f2f7f4',
  net: 'rgba(242, 247, 244, 0.28)',
  crowd: 'rgba(242, 247, 244, 0.14)',
  defender: '#252a33',
  keeper: '#d9a02b',
  ball: '#f2f7f4',
  reticle: 'rgba(125, 219, 164, 0.9)',
  reticleFill: 'rgba(125, 219, 164, 0.14)',
} as const;

export class CanvasShotRenderer implements MatchRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private viewport: Viewport = { width: 360, height: 640 };

  mount(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  resize(width: number, height: number, devicePixelRatio: number): void {
    if (!this.canvas || !this.ctx) return;
    // Backing store in device pixels, drawing in CSS pixels: crisp on any
    // screen without the drawing code ever knowing the DPR exists.
    this.canvas.width = Math.round(width * devicePixelRatio);
    this.canvas.height = Math.round(height * devicePixelRatio);
    this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    this.viewport = { width, height };
  }

  destroy(): void {
    this.canvas = null;
    this.ctx = null;
  }

  render(scene: ShotScene): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const view = this.viewport;
    const camera = cameraFor(scene.distance, scene.angle, view);

    const flight = scene.ballFlight;
    const ballInNet = flight !== null && flight.metresFromGoal < 0;

    this.drawBackdrop(ctx, camera, view);
    this.drawPitch(ctx, scene, camera, view);
    // A ball inside the goal is drawn before the net so the mesh overlays it.
    if (flight && ballInNet) this.drawBallAt(ctx, flight, scene, camera, view);
    this.drawGoal(ctx, scene, camera, view);
    this.drawKeeper(ctx, scene, camera, view);
    this.drawDefenders(ctx, scene, camera, view);
    this.drawShooter(ctx, scene, camera, view);
    if (flight && !ballInNet) this.drawBallAt(ctx, flight, scene, camera, view);
    if (!flight) this.drawBall(ctx, scene, camera, view);
    if (scene.aim) this.drawReticle(ctx, scene, camera, view);
    if (scene.ballMark) this.drawBallMark(ctx, scene, camera, view);
  }

  /** The ball frozen where it crossed the goal plane, ringed for visibility. */
  private drawBallMark(
    ctx: CanvasRenderingContext2D,
    scene: ShotScene,
    camera: Camera,
    view: Viewport,
  ): void {
    const mark = scene.ballMark;
    if (!mark) return;

    const depth = depthOf(0, scene.distance, camera);
    const p = project(mark.x, Math.max(0.11, mark.y), depth, camera, view);
    const r = Math.max(3, p.scale * 0.11);

    ctx.strokeStyle = COLOURS.reticle;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r * 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = COLOURS.ball;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBackdrop(ctx: CanvasRenderingContext2D, camera: Camera, view: Viewport): void {
    const sky = ctx.createLinearGradient(0, 0, 0, camera.horizonY);
    sky.addColorStop(0, COLOURS.skyTop);
    sky.addColorStop(1, COLOURS.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, view.width, camera.horizonY);

    // Crowd: a band of dots. Deterministic pattern, no randomness — the
    // renderer must never consume entropy.
    ctx.fillStyle = COLOURS.crowd;
    const bandTop = camera.horizonY * 0.45;
    for (let y = bandTop; y < camera.horizonY - 4; y += 7) {
      for (let x = ((y * 13) % 11) - 10; x < view.width; x += 11) {
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }

  private drawPitch(
    ctx: CanvasRenderingContext2D,
    scene: ShotScene,
    camera: Camera,
    view: Viewport,
  ): void {
    ctx.fillStyle = COLOURS.grassB;
    ctx.fillRect(0, camera.horizonY, view.width, view.height - camera.horizonY);

    // Mowing stripes, projected: bands of equal world depth.
    const stripeM = 4;
    for (let m = 0; m < scene.distance + 20; m += stripeM * 2) {
      const near = project(0, 0, depthOf(m, scene.distance, camera), camera, view).sy;
      const far = project(0, 0, depthOf(m + stripeM, scene.distance, camera), camera, view).sy;
      ctx.fillStyle = COLOURS.grassA;
      ctx.fillRect(0, Math.min(near, view.height), view.width, Math.max(1, far - near));
    }

    // Goal line and the penalty box, drawn in world space.
    this.worldLine(ctx, scene, camera, view, -20, 0, 20, 0);
    this.worldLine(ctx, scene, camera, view, -9.15, 0, -9.15, 5.5 * 2);
    this.worldLine(ctx, scene, camera, view, 9.15, 0, 9.15, 11);
    this.worldLine(ctx, scene, camera, view, -9.15, 11, 9.15, 11);
  }

  private worldLine(
    ctx: CanvasRenderingContext2D,
    scene: ShotScene,
    camera: Camera,
    view: Viewport,
    x1: number,
    m1: number,
    x2: number,
    m2: number,
  ): void {
    const a = project(x1, 0, depthOf(m1, scene.distance, camera), camera, view);
    const b = project(x2, 0, depthOf(m2, scene.distance, camera), camera, view);
    ctx.strokeStyle = COLOURS.line;
    ctx.lineWidth = Math.max(1, a.scale * 0.05);
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy);
    ctx.lineTo(b.sx, b.sy);
    ctx.stroke();
  }

  private drawGoal(
    ctx: CanvasRenderingContext2D,
    scene: ShotScene,
    camera: Camera,
    view: Viewport,
  ): void {
    const depth = depthOf(0, scene.distance, camera);
    const left = project(-GOAL_HALF_WIDTH, 0, depth, camera, view);
    const right = project(GOAL_HALF_WIDTH, 0, depth, camera, view);
    const topLeft = project(-GOAL_HALF_WIDTH, GOAL_HEIGHT, depth, camera, view);
    const topRight = project(GOAL_HALF_WIDTH, GOAL_HEIGHT, depth, camera, view);

    // Net: vertical and horizontal threads inside the frame.
    ctx.strokeStyle = COLOURS.net;
    ctx.lineWidth = 1;
    const meshes = 14;
    for (let i = 1; i < meshes; i += 1) {
      const t = i / meshes;
      const x = left.sx + (right.sx - left.sx) * t;
      ctx.beginPath();
      ctx.moveTo(x, topLeft.sy);
      ctx.lineTo(x, left.sy);
      ctx.stroke();
    }
    for (let i = 1; i < 6; i += 1) {
      const y = topLeft.sy + (left.sy - topLeft.sy) * (i / 6);
      ctx.beginPath();
      ctx.moveTo(left.sx, y);
      ctx.lineTo(right.sx, y);
      ctx.stroke();
    }

    // Frame on top of the net.
    ctx.strokeStyle = COLOURS.goalFrame;
    ctx.lineWidth = Math.max(2, left.scale * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(left.sx, left.sy);
    ctx.lineTo(topLeft.sx, topLeft.sy);
    ctx.lineTo(topRight.sx, topRight.sy);
    ctx.lineTo(right.sx, right.sy);
    ctx.stroke();
  }

  /** A body as a simple silhouette: torso, head. Scaled by depth. */
  private drawBody(
    ctx: CanvasRenderingContext2D,
    sx: number,
    groundY: number,
    scale: number,
    shirt: string,
    heightM = 1.8,
  ): void {
    const h = heightM * scale;
    const w = h * 0.34;

    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.roundRect(sx - w / 2, groundY - h * 0.86, w, h * 0.62, w * 0.3);
    ctx.fill();
    // Legs
    ctx.fillRect(sx - w * 0.32, groundY - h * 0.28, w * 0.24, h * 0.28);
    ctx.fillRect(sx + w * 0.08, groundY - h * 0.28, w * 0.24, h * 0.28);
    // Head
    ctx.beginPath();
    ctx.arc(sx, groundY - h * 0.93, h * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawKeeper(
    ctx: CanvasRenderingContext2D,
    scene: ShotScene,
    camera: Camera,
    view: Viewport,
  ): void {
    const pose = scene.keeperPose;
    const reachM = 2.6;

    // The dive shifts the keeper along the goal line and tips the body over.
    const offsetX = pose ? pose.dive * reachM : 0;
    const depth = depthOf(0.8, scene.distance, camera);
    const p = project(scene.keeperX + offsetX, 0, depth, camera, view);

    if (pose && Math.abs(pose.dive) > 0.01) {
      ctx.save();
      ctx.translate(p.sx, p.sy);
      ctx.rotate(pose.dive * pose.stretch * 1.1);
      this.drawBody(ctx, 0, 0, p.scale, COLOURS.keeper, 1.9);
      ctx.restore();
      return;
    }

    this.drawBody(ctx, p.sx, p.sy, p.scale, COLOURS.keeper, 1.9);
  }

  /** The ball at an arbitrary world position — flight frames. */
  private drawBallAt(
    ctx: CanvasRenderingContext2D,
    flight: NonNullable<ShotScene['ballFlight']>,
    scene: ShotScene,
    camera: Camera,
    view: Viewport,
  ): void {
    const depth = depthOf(flight.metresFromGoal, scene.distance, camera);
    const p = project(flight.x, flight.y, depth, camera, view);
    const r = Math.max(3, p.scale * 0.11);

    ctx.save();
    ctx.globalAlpha = flight.alpha;
    ctx.fillStyle = COLOURS.ball;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLOURS.skyBottom;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawDefenders(
    ctx: CanvasRenderingContext2D,
    scene: ShotScene,
    camera: Camera,
    view: Viewport,
  ): void {
    // Far to near, so nearer bodies overlap farther ones.
    const sorted = [...scene.defenders].sort((a, b) => b.depth - a.depth);
    for (const defender of sorted) {
      const depth = depthOf(defender.depth, scene.distance, camera);
      const p = project(defender.x, 0, depth, camera, view);
      this.drawBody(ctx, p.sx, p.sy, p.scale, COLOURS.defender);
    }
  }

  private drawShooter(
    ctx: CanvasRenderingContext2D,
    scene: ShotScene,
    camera: Camera,
    view: Viewport,
  ): void {
    const x = ballWorldX(scene.distance, scene.angle);
    const depth = depthOf(scene.distance - 0.6, scene.distance, camera);
    const p = project(x - 0.5, 0, depth, camera, view);
    this.drawBody(ctx, p.sx, p.sy, p.scale, scene.kit.primary);
  }

  private drawBall(
    ctx: CanvasRenderingContext2D,
    scene: ShotScene,
    camera: Camera,
    view: Viewport,
  ): void {
    const x = ballWorldX(scene.distance, scene.angle);
    const depth = depthOf(scene.distance, scene.distance, camera);
    const p = project(x, 0.11, depth, camera, view);
    const r = Math.max(3, p.scale * 0.11);

    ctx.fillStyle = COLOURS.ball;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = COLOURS.skyBottom;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawReticle(
    ctx: CanvasRenderingContext2D,
    scene: ShotScene,
    camera: Camera,
    view: Viewport,
  ): void {
    const aim = scene.aim;
    if (!aim) return;

    const depth = depthOf(0, scene.distance, camera);
    const centre = project(aim.x * GOAL_HALF_WIDTH, aim.y * GOAL_HEIGHT, depth, camera, view);
    const radius = Math.max(6, aim.spreadM * centre.scale);

    ctx.fillStyle = COLOURS.reticleFill;
    ctx.strokeStyle = COLOURS.reticle;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centre.sx, centre.sy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Cross hairs.
    ctx.beginPath();
    ctx.moveTo(centre.sx - radius * 0.45, centre.sy);
    ctx.lineTo(centre.sx + radius * 0.45, centre.sy);
    ctx.moveTo(centre.sx, centre.sy - radius * 0.45);
    ctx.lineTo(centre.sx, centre.sy + radius * 0.45);
    ctx.stroke();
  }
}
