/**
 * Canvas 2D implementation of the match renderer.
 *
 * Everything is generated: there is no image asset anywhere in the project.
 * Colours and art constants live in palette.ts; this file is the drawing.
 *
 * Pure rendering: no React, no game rules, no timers, no randomness. It draws
 * exactly the scene it is handed, once per `render` call.
 */
import { HAIR_STYLES, type Appearance } from '@/engine/domain/appearance';
import { GOAL_HALF_WIDTH, GOAL_HEIGHT } from '@/engine/balance/shot';

import { drawAthlete } from './athlete';
import {
  BALL,
  DEFENDER,
  FLOODLIGHT,
  GOAL,
  GRASS,
  KEEPER,
  LINES,
  RETICLE,
  SHADOW,
  SKY,
  STADIUM,
  VIGNETTE,
} from './palette';
import { ballWorldX, cameraFor, depthOf, project } from './projection';
import type { Camera, Viewport } from './projection';
import type { MatchRenderer, ShotScene } from './types';

/**
 * A look for a background player.
 *
 * Deterministic from an index, never random: the renderer must not consume
 * entropy, or the same scene would draw differently on every frame of an
 * animation. Enough variety that a wall of defenders is not one man cloned.
 */
function extraAppearance(index: number): Appearance {
  const spin = (offset: number, span: number) => (index * 7 + offset * 3) % span;

  return {
    skinTone: spin(1, 5),
    hairStyle: HAIR_STYLES[spin(2, HAIR_STYLES.length)] as Appearance['hairStyle'],
    hairColour: spin(3, 5),
    beard: (['none', 'stubble', 'none', 'full'] as const)[spin(4, 4)] as Appearance['beard'],
    height: 1.74 + ((index * 5) % 7) * 0.03,
    build: ((index * 3) % 5) / 4,
  };
}

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

    this.drawSky(ctx, camera, view);
    this.drawStands(ctx, camera, view);
    this.drawPitch(ctx, scene, camera, view);
    this.drawMarkings(ctx, scene, camera, view);

    // A ball already inside the goal is drawn before the net, so the mesh
    // reads as being in front of it.
    if (flight && ballInNet) this.drawBall(ctx, scene, camera, view, flight);

    this.drawGoal(ctx, scene, camera, view);
    this.drawKeeper(ctx, scene, camera, view);
    this.drawDefenders(ctx, scene, camera, view);

    if (scene.aim) this.drawReticle(ctx, scene, camera, view);
    if (flight && !ballInNet) this.drawBall(ctx, scene, camera, view, flight);
    if (!flight) this.drawStaticBall(ctx, scene, camera, view);
    if (scene.ballMark) this.drawBallMark(ctx, scene, camera, view);

    // The shooter is deliberately not drawn here. A body close enough to the
    // camera to be recognisable is also big enough to cover the goal and the
    // reticle — which is exactly what the first pass did. The athlete gets
    // his own framing, at size, in the moment card and the profile screen.
    this.drawVignette(ctx, view);
  }

  // ------------------------------------------------------------ atmosphere

  private drawSky(ctx: CanvasRenderingContext2D, camera: Camera, view: Viewport): void {
    const sky = ctx.createLinearGradient(0, 0, 0, camera.horizonY);
    sky.addColorStop(0, SKY.top);
    sky.addColorStop(1, SKY.horizon);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, view.width, camera.horizonY);

    // Floodlight glow from the top corners.
    for (const x of [view.width * 0.16, view.width * 0.84]) {
      const glow = ctx.createRadialGradient(x, 0, 0, x, 0, camera.horizonY * 1.5);
      glow.addColorStop(0, FLOODLIGHT.glow);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, view.width, camera.horizonY * 1.5);
    }
  }

  /**
   * Stands: tiers of crowd behind the goal.
   *
   * Deterministic pattern rather than noise — the renderer never consumes
   * entropy, so the same scene always draws identically.
   */
  private drawStands(ctx: CanvasRenderingContext2D, camera: Camera, view: Viewport): void {
    const base = camera.horizonY;
    const tierHeight = base * 0.42;
    const top = base - tierHeight;

    ctx.fillStyle = STADIUM.standBack;
    ctx.fillRect(0, top, view.width, tierHeight);

    // Crowd speckle: two colours interleaved, denser and dimmer towards the
    // back so the tier reads as having depth.
    for (let row = 0; row < 14; row += 1) {
      const y = top + (tierHeight * row) / 14;
      const depthFade = 0.35 + (row / 14) * 0.65;
      const step = 5 + (row % 3);

      for (let i = 0; i * step < view.width; i += 1) {
        const x = i * step + ((row * 7) % step);
        ctx.globalAlpha = depthFade * (i % 3 === 0 ? 0.9 : 0.55);
        ctx.fillStyle = (i + row) % 2 === 0 ? STADIUM.crowdWarm : STADIUM.crowdCool;
        ctx.fillRect(x, y, 2, 2);
      }
    }
    ctx.globalAlpha = 1;

    // Front rail and the dark gap between crowd and pitch.
    ctx.fillStyle = STADIUM.standFront;
    ctx.fillRect(0, base - tierHeight * 0.14, view.width, tierHeight * 0.14);
    ctx.fillStyle = STADIUM.rail;
    ctx.fillRect(0, base - tierHeight * 0.14, view.width, 1);

    // Haze where the pitch meets the stand, so the join is not a hard seam.
    const fog = ctx.createLinearGradient(0, base - tierHeight * 0.3, 0, base + tierHeight * 0.5);
    fog.addColorStop(0, 'rgba(0,0,0,0)');
    fog.addColorStop(0.5, SKY.fog);
    fog.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, base - tierHeight * 0.3, view.width, tierHeight * 0.8);
  }

  // ----------------------------------------------------------------- pitch

  private drawPitch(
    ctx: CanvasRenderingContext2D,
    scene: ShotScene,
    camera: Camera,
    view: Viewport,
  ): void {
    const horizon = camera.horizonY;

    // Lit, not flat: dark at the horizon, bright through the middle where the
    // floodlights pool, dimming again at the bottom to give the frame weight.
    const grass = ctx.createLinearGradient(0, horizon, 0, view.height);
    grass.addColorStop(0, GRASS.far);
    grass.addColorStop(0.45, GRASS.mid);
    grass.addColorStop(1, GRASS.near);
    ctx.fillStyle = grass;
    ctx.fillRect(0, horizon, view.width, view.height - horizon);

    // Mowing stripes: bands of equal world depth, so they compress towards
    // the horizon on their own. Drawn as light modulation over the gradient
    // rather than as a second green, which is what made them read as flat
    // blocks before.
    //
    // Three metres, not five: the wider bands left the middle of the frame as
    // one uninterrupted slab of green with nothing to read distance against.
    const stripeM = 3;
    const reach = scene.distance + 34;
    for (let m = -12, i = 0; m < reach; m += stripeM, i += 1) {
      const nearY = project(0, 0, depthOf(m, scene.distance, camera), camera, view).sy;
      const farY = project(0, 0, depthOf(m + stripeM, scene.distance, camera), camera, view).sy;

      const top = Math.min(nearY, farY);
      const height = Math.abs(farY - nearY);
      if (top > view.height || top + height < horizon) continue;

      ctx.fillStyle = i % 2 === 0 ? GRASS.stripeLight : GRASS.stripeDark;
      ctx.fillRect(0, Math.max(horizon, top), view.width, Math.max(0.5, height));
    }

    this.drawGrassTexture(ctx, scene, camera, view);
  }

  /**
   * Blade texture: fine lines at fixed world spacing.
   *
   * Because the spacing is in metres, they crowd together towards the horizon
   * exactly as real turf does — which is what turns the middle of the frame
   * from a flat slab into ground with distance in it.
   */
  private drawGrassTexture(
    ctx: CanvasRenderingContext2D,
    scene: ShotScene,
    camera: Camera,
    view: Viewport,
  ): void {
    ctx.fillStyle = GRASS.texture;
    const spacing = 0.45;
    const reach = scene.distance + 26;

    for (let m = -10; m < reach; m += spacing) {
      const y = project(0, 0, depthOf(m, scene.distance, camera), camera, view).sy;
      if (y < camera.horizonY + 1 || y > view.height) continue;
      // Thicker near the camera, hairline in the distance.
      const thickness = Math.min(2, Math.max(0.4, (y - camera.horizonY) / view.height));
      ctx.fillRect(0, y, view.width, thickness);
    }
  }

  private drawMarkings(
    ctx: CanvasRenderingContext2D,
    scene: ShotScene,
    camera: Camera,
    view: Viewport,
  ): void {
    const line = (x1: number, m1: number, x2: number, m2: number, far = false) => {
      const a = project(x1, 0, depthOf(m1, scene.distance, camera), camera, view);
      const b = project(x2, 0, depthOf(m2, scene.distance, camera), camera, view);
      ctx.strokeStyle = far ? LINES.paintFar : LINES.paint;
      // Physically 12cm wide, but capped: a line two metres from the lens is
      // correctly enormous and reads as a paint spill rather than a marking.
      ctx.lineWidth = Math.min(9, Math.max(1, Math.min(a.scale, b.scale) * 0.12));
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy);
      ctx.lineTo(b.sx, b.sy);
      ctx.stroke();
    };

    // Goal line, then the six-yard box and the penalty area — full
    // rectangles, so nothing reads as a stray line hanging in space.
    line(-34, 0, 34, 0);

    line(-9.16, 0, -9.16, 5.5);
    line(9.16, 0, 9.16, 5.5);
    line(-9.16, 5.5, 9.16, 5.5);

    line(-20.16, 0, -20.16, 16.5, true);
    line(20.16, 0, 20.16, 16.5, true);
    line(-20.16, 16.5, 20.16, 16.5, true);

    // Penalty spot. Dimmer and capped: drawn at its true size in the paint
    // colour it read as a second ball lying on the pitch.
    const spot = project(0, 0, depthOf(11, scene.distance, camera), camera, view);
    ctx.fillStyle = LINES.paintFar;
    ctx.beginPath();
    ctx.arc(spot.sx, spot.sy, Math.min(5, Math.max(1, spot.scale * 0.08)), 0, Math.PI * 2);
    ctx.fill();
  }

  // ------------------------------------------------------------------ goal

  private drawGoal(
    ctx: CanvasRenderingContext2D,
    scene: ShotScene,
    camera: Camera,
    view: Viewport,
  ): void {
    const depth = depthOf(0, scene.distance, camera);
    const backDepth = depth + 1.8; // net depth

    const left = project(-GOAL_HALF_WIDTH, 0, depth, camera, view);
    const right = project(GOAL_HALF_WIDTH, 0, depth, camera, view);
    const topLeft = project(-GOAL_HALF_WIDTH, GOAL_HEIGHT, depth, camera, view);
    const topRight = project(GOAL_HALF_WIDTH, GOAL_HEIGHT, depth, camera, view);

    const backLeft = project(-GOAL_HALF_WIDTH, 0, backDepth, camera, view);
    const backRight = project(GOAL_HALF_WIDTH, 0, backDepth, camera, view);
    const backTopLeft = project(-GOAL_HALF_WIDTH, GOAL_HEIGHT * 0.82, backDepth, camera, view);
    const backTopRight = project(GOAL_HALF_WIDTH, GOAL_HEIGHT * 0.82, backDepth, camera, view);

    // The net's interior, darkened so the mouth reads as a cavity.
    ctx.fillStyle = GOAL.netShade;
    ctx.beginPath();
    ctx.moveTo(topLeft.sx, topLeft.sy);
    ctx.lineTo(topRight.sx, topRight.sy);
    ctx.lineTo(right.sx, right.sy);
    ctx.lineTo(left.sx, left.sy);
    ctx.closePath();
    ctx.fill();

    // Mesh on the back of the net.
    ctx.strokeStyle = GOAL.net;
    ctx.lineWidth = 1;
    const columns = 16;
    for (let i = 0; i <= columns; i += 1) {
      const u = i / columns;
      ctx.beginPath();
      ctx.moveTo(
        backTopLeft.sx + (backTopRight.sx - backTopLeft.sx) * u,
        backTopLeft.sy + (backTopRight.sy - backTopLeft.sy) * u,
      );
      ctx.lineTo(
        backLeft.sx + (backRight.sx - backLeft.sx) * u,
        backLeft.sy + (backRight.sy - backLeft.sy) * u,
      );
      ctx.stroke();
    }
    const rows = 8;
    for (let i = 0; i <= rows; i += 1) {
      const v = i / rows;
      ctx.beginPath();
      ctx.moveTo(
        backTopLeft.sx + (backLeft.sx - backTopLeft.sx) * v,
        backTopLeft.sy + (backLeft.sy - backTopLeft.sy) * v,
      );
      ctx.lineTo(
        backTopRight.sx + (backRight.sx - backTopRight.sx) * v,
        backTopRight.sy + (backRight.sy - backTopRight.sy) * v,
      );
      ctx.stroke();
    }

    // Side netting, joining front frame to back.
    ctx.beginPath();
    ctx.moveTo(topLeft.sx, topLeft.sy);
    ctx.lineTo(backTopLeft.sx, backTopLeft.sy);
    ctx.moveTo(left.sx, left.sy);
    ctx.lineTo(backLeft.sx, backLeft.sy);
    ctx.moveTo(topRight.sx, topRight.sy);
    ctx.lineTo(backTopRight.sx, backTopRight.sy);
    ctx.moveTo(right.sx, right.sy);
    ctx.lineTo(backRight.sx, backRight.sy);
    ctx.stroke();

    // Frame, with a shaded pass underneath for a hint of round section.
    const thickness = Math.max(2.5, left.scale * 0.13);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.strokeStyle = GOAL.frameShade;
    ctx.lineWidth = thickness * 1.5;
    ctx.beginPath();
    ctx.moveTo(left.sx, left.sy);
    ctx.lineTo(topLeft.sx, topLeft.sy);
    ctx.lineTo(topRight.sx, topRight.sy);
    ctx.lineTo(right.sx, right.sy);
    ctx.stroke();

    ctx.strokeStyle = GOAL.frame;
    ctx.lineWidth = thickness;
    ctx.beginPath();
    ctx.moveTo(left.sx, left.sy);
    ctx.lineTo(topLeft.sx, topLeft.sy);
    ctx.lineTo(topRight.sx, topRight.sy);
    ctx.lineTo(right.sx, right.sy);
    ctx.stroke();
  }

  // ---------------------------------------------------------------- bodies

  /** Grounding shadow. Nothing looks placed on the pitch without one. */
  private drawShadow(
    ctx: CanvasRenderingContext2D,
    sx: number,
    groundY: number,
    scale: number,
    widthM: number,
  ): void {
    ctx.save();
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    ctx.ellipse(sx, groundY, widthM * scale, widthM * scale * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawKeeper(
    ctx: CanvasRenderingContext2D,
    scene: ShotScene,
    camera: Camera,
    view: Viewport,
  ): void {
    const pose = scene.keeperPose;
    const reachM = 2.6;
    const offsetX = pose ? pose.dive * reachM : 0;

    const depth = depthOf(0.7, scene.distance, camera);
    const p = project(scene.keeperX + offsetX, 0, depth, camera, view);

    this.drawShadow(ctx, p.sx, p.sy, p.scale, 0.45);
    drawAthlete(ctx, {
      sx: p.sx,
      groundY: p.sy,
      scale: p.scale,
      appearance: extraAppearance(7),
      kit: { primary: KEEPER.shirt, secondary: KEEPER.shirtShade },
      shirtNumber: 1,
      ...(pose
        ? { pose: { lean: pose.dive * pose.stretch * 1.15, stretch: pose.stretch } }
        : {}),
    });
  }

  private drawDefenders(
    ctx: CanvasRenderingContext2D,
    scene: ShotScene,
    camera: Camera,
    view: Viewport,
  ): void {
    // Far to near, so nearer bodies overlap farther ones.
    const sorted = [...scene.defenders]
      .map((defender, index) => ({ defender, index }))
      .sort((a, b) => b.defender.depth - a.defender.depth);

    for (const { defender, index } of sorted) {
      const depth = depthOf(defender.depth, scene.distance, camera);
      const p = project(defender.x, 0, depth, camera, view);
      this.drawShadow(ctx, p.sx, p.sy, p.scale, 0.4);
      drawAthlete(ctx, {
        sx: p.sx,
        groundY: p.sy,
        scale: p.scale,
        appearance: extraAppearance(index),
        kit: { primary: DEFENDER.shirt, secondary: DEFENDER.shirtShade },
      });
    }
  }

  // ------------------------------------------------------------------ ball

  private ballAt(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    scale: number,
    groundY: number,
  ): void {
    const r = Math.max(2.5, scale * 0.11);

    // Ground shadow: tight and dark, and only worth drawing when the ball is
    // clearly off the ground.
    if (groundY > sy + r * 0.3) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      this.drawShadow(ctx, sx, groundY, scale, 0.13);
      ctx.restore();
    }

    // Lit from the floodlights above: a radial gradient rather than two
    // stacked circles, which left a grey crescent hanging off the bottom.
    const shading = ctx.createRadialGradient(
      sx - r * 0.3,
      sy - r * 0.35,
      r * 0.1,
      sx,
      sy,
      r * 1.05,
    );
    shading.addColorStop(0, BALL.base);
    shading.addColorStop(0.65, BALL.base);
    shading.addColorStop(1, BALL.shade);

    ctx.fillStyle = shading;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();

    // Panels, only once the ball is big enough for them to read as panels
    // instead of dirt.
    if (r > 5) {
      ctx.fillStyle = BALL.panel;
      ctx.beginPath();
      ctx.arc(sx - r * 0.05, sy - r * 0.05, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawStaticBall(
    ctx: CanvasRenderingContext2D,
    scene: ShotScene,
    camera: Camera,
    view: Viewport,
  ): void {
    const x = ballWorldX(scene.distance, scene.angle);
    const depth = depthOf(scene.distance, scene.distance, camera);
    const p = project(x, 0.11, depth, camera, view);
    const ground = project(x, 0, depth, camera, view);
    this.ballAt(ctx, p.sx, p.sy, p.scale, ground.sy);
  }

  private drawBall(
    ctx: CanvasRenderingContext2D,
    scene: ShotScene,
    camera: Camera,
    view: Viewport,
    flight: NonNullable<ShotScene['ballFlight']>,
  ): void {
    const depth = depthOf(flight.metresFromGoal, scene.distance, camera);
    const p = project(flight.x, flight.y, depth, camera, view);
    const ground = project(flight.x, 0, depth, camera, view);

    ctx.save();
    ctx.globalAlpha = flight.alpha;
    this.ballAt(ctx, p.sx, p.sy, p.scale, ground.sy);
    ctx.restore();
  }

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

    ctx.strokeStyle = RETICLE.ring;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r * 2.1, 0, Math.PI * 2);
    ctx.stroke();

    this.ballAt(ctx, p.sx, p.sy, p.scale, p.sy);
  }

  // --------------------------------------------------------------- overlay

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
    const radius = Math.max(7, aim.spreadM * centre.scale);

    ctx.fillStyle = RETICLE.fill;
    ctx.strokeStyle = RETICLE.ring;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centre.sx, centre.sy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = RETICLE.cross;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(centre.sx - radius * 0.4, centre.sy);
    ctx.lineTo(centre.sx + radius * 0.4, centre.sy);
    ctx.moveTo(centre.sx, centre.sy - radius * 0.4);
    ctx.lineTo(centre.sx, centre.sy + radius * 0.4);
    ctx.stroke();
  }

  private drawVignette(ctx: CanvasRenderingContext2D, view: Viewport): void {
    const vignette = ctx.createRadialGradient(
      view.width / 2,
      view.height * 0.45,
      Math.min(view.width, view.height) * 0.35,
      view.width / 2,
      view.height * 0.45,
      Math.max(view.width, view.height) * 0.78,
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, VIGNETTE);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, view.width, view.height);
  }
}
