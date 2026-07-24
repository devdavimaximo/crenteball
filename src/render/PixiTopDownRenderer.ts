/**
 * Top-down match renderer, on PixiJS (WebGL).
 *
 * Draws the pitch snapshot it is handed, once per `render`. Persistent Graphics
 * layers are cleared and redrawn each call — a dozen figures and some lines is
 * nothing for the GPU, and it keeps the code a straight function of the scene,
 * which is what makes 60fps animation (slice E) a matter of calling render
 * every frame rather than mutating a scene graph by hand.
 *
 * No game rules here. Metres in, pixels out, via the top-down camera.
 */
import { Application, Container, Graphics } from 'pixi.js';

import type { Appearance } from '@/engine/domain/appearance';
import type { Point } from '@/engine/domain/pitch';
import { BOX_DEPTH, BOX_HALF_WIDTH, PENALTY_SPOT_Y, SIX_YARD_DEPTH } from '@/engine/domain/pitch';
import { GOAL_HALF_WIDTH } from '@/engine/balance/shot';

import { hairColour, skinColour } from './athlete';
import { heightPx, projectGround, topDownCamera, unprojectGround } from './topdown';
import type { TopDownCamera, Viewport } from './topdown';
import type { Figure, Kit, TopDownEffects, TopDownScene } from './topdownScene';

const GRASS_DARK = '#166b3d';
const GRASS_LIGHT = '#1c7a45';
const LINE = 0xf1f7f3;
const GOAL_FRAME = 0xf6faf8;
const SHADOW = 0x061206;
const OUTLINE = 0x0a1508;

const ARROW_COLOUR: Record<string, number> = {
  shot: 0x7ddba4,
  pass: 0x6fb3ff,
  cross: 0xf5c451,
  'through-ball': 0xe6ecff,
};

const STRIPE_M = 4;

export class PixiTopDownRenderer {
  private app: Application | null = null;
  private viewport: Viewport = { width: 390, height: 780 };

  /** Everything on the pitch lives in `world`, so camera shake moves it all. */
  private readonly world = new Container();
  private readonly grass = new Graphics();
  private readonly markings = new Graphics();
  private readonly shadows = new Graphics();
  private readonly turf = new Graphics();
  private readonly trail = new Graphics();
  private readonly actors = new Container();
  private readonly ball = new Graphics();
  private readonly arrow = new Graphics();
  /** The goal flash sits outside `world`, so it fills the frame while it shakes. */
  private readonly flash = new Graphics();

  /**
   * Mounts into a container element. Pixi creates and owns its own canvas —
   * rather than rendering into one React manages — so StrictMode's mount /
   * unmount / remount cannot leave two WebGL contexts fighting over a single
   * canvas. Init is async because creating the GL context is.
   */
  async init(
    container: HTMLElement,
    width: number,
    height: number,
    dpr: number,
  ): Promise<void> {
    const app = new Application();
    await app.init({
      width,
      height,
      antialias: true,
      backgroundAlpha: 0,
      resolution: dpr,
      autoDensity: true,
    });

    this.world.addChild(
      this.grass,
      this.markings,
      this.shadows,
      this.turf,
      this.trail,
      this.actors,
      this.ball,
      this.arrow,
    );
    app.stage.addChild(this.world, this.flash);
    app.canvas.style.width = '100%';
    app.canvas.style.height = '100%';
    app.canvas.style.display = 'block';
    container.appendChild(app.canvas);

    this.app = app;
    this.viewport = { width, height };
  }

  resize(width: number, height: number): void {
    this.viewport = { width, height };
    this.app?.renderer.resize(width, height);
  }

  destroy(): void {
    // `true` removes Pixi's own canvas from the DOM as well.
    this.app?.destroy({ removeView: true }, { children: true });
    this.app = null;
  }

  /** For screenshots and tests: force a synchronous frame. */
  renderNow(): void {
    this.app?.renderer.render(this.app.stage);
  }

  render(scene: TopDownScene, effects?: TopDownEffects): void {
    if (!this.app) return;
    const cam = topDownCamera(scene.focus, this.viewport);

    // Camera shake moves the whole world; the flash overlay does not shake.
    if (effects) {
      this.world.position.set(effects.shakeX * cam.scale, effects.shakeY * cam.scale);
    } else {
      this.world.position.set(0, 0);
    }

    this.drawGrass(cam);
    this.drawMarkings(cam, effects?.netImpact ?? null);
    this.drawTurf(cam, effects);
    this.drawFigures(cam, scene);
    this.drawTrail(cam, effects);
    this.drawBall(cam, scene);
    this.drawArrow(cam, scene);
    this.drawFlash(effects);

    this.renderNow();
  }

  private drawTurf(cam: TopDownCamera, effects?: TopDownEffects): void {
    const g = this.turf.clear();
    if (!effects) return;
    for (const speck of effects.turf) {
      const p = projectGround({ x: speck.x, y: speck.y }, cam);
      g.circle(p.sx, p.sy, Math.max(1, cam.scale * 0.06)).fill({
        color: 0x0e5c33,
        alpha: speck.alpha,
      });
    }
  }

  private drawTrail(cam: TopDownCamera, effects?: TopDownEffects): void {
    const g = this.trail.clear();
    if (!effects) return;
    effects.trail.forEach((point, index) => {
      const fade = 1 - index / (effects.trail.length + 1);
      const ground = projectGround({ x: point.x, y: point.y }, cam);
      const r = Math.max(2, cam.scale * 0.16 * fade);
      g.circle(ground.sx, ground.sy - heightPx(point.h, cam), r).fill({
        color: 0xf8fbf9,
        alpha: fade * 0.35,
      });
    });
  }

  private drawFlash(effects?: TopDownEffects): void {
    const g = this.flash.clear();
    if (!effects || effects.flash <= 0) return;
    g.rect(0, 0, this.viewport.width, this.viewport.height).fill({
      color: 0xe8fff0,
      alpha: effects.flash * 0.16,
    });
  }

  // -------------------------------------------------------------- pitch

  private drawGrass(cam: TopDownCamera): void {
    const g = this.grass.clear();
    const { width, height } = this.viewport;

    g.rect(0, 0, width, height).fill(GRASS_DARK);

    // Mowing stripes: bands of equal world depth. Orthographic, so they stay
    // evenly spaced — no perspective convergence to fake.
    const topWorldY = unprojectGround(width / 2, 0, cam).y;
    const bottomWorldY = unprojectGround(width / 2, height, cam).y;
    const first = Math.floor(topWorldY / STRIPE_M) - 1;
    const last = Math.ceil(bottomWorldY / STRIPE_M) + 1;

    for (let i = first; i <= last; i += 1) {
      if (i % 2 !== 0) continue;
      const y0 = projectGround({ x: 0, y: i * STRIPE_M }, cam).sy;
      const y1 = projectGround({ x: 0, y: (i + 1) * STRIPE_M }, cam).sy;
      g.rect(0, y0, width, y1 - y0).fill(GRASS_LIGHT);
    }
  }

  private drawMarkings(
    cam: TopDownCamera,
    netImpact: TopDownEffects['netImpact'],
  ): void {
    const g = this.markings.clear();
    const stroke = { width: 2, color: LINE, alpha: 0.7 };

    const line = (a: Point, b: Point) => {
      const pa = projectGround(a, cam);
      const pb = projectGround(b, cam);
      g.moveTo(pa.sx, pa.sy).lineTo(pb.sx, pb.sy);
    };

    // Goal line and the two boxes.
    line({ x: -34, y: 0 }, { x: 34, y: 0 });
    line({ x: -BOX_HALF_WIDTH, y: 0 }, { x: -BOX_HALF_WIDTH, y: BOX_DEPTH });
    line({ x: BOX_HALF_WIDTH, y: 0 }, { x: BOX_HALF_WIDTH, y: BOX_DEPTH });
    line({ x: -BOX_HALF_WIDTH, y: BOX_DEPTH }, { x: BOX_HALF_WIDTH, y: BOX_DEPTH });
    line({ x: -9.16, y: 0 }, { x: -9.16, y: SIX_YARD_DEPTH });
    line({ x: 9.16, y: 0 }, { x: 9.16, y: SIX_YARD_DEPTH });
    line({ x: -9.16, y: SIX_YARD_DEPTH }, { x: 9.16, y: SIX_YARD_DEPTH });
    g.stroke(stroke);

    // Penalty spot.
    const spot = projectGround({ x: 0, y: PENALTY_SPOT_Y }, cam);
    g.circle(spot.sx, spot.sy, 2).fill(LINE);

    this.drawGoal(g, cam, netImpact);
  }

  /**
   * The goal, given a little depth: the net extends behind the line (towards
   * the top of the screen) and the frame stands up off the ground.
   */
  private drawGoal(
    g: Graphics,
    cam: TopDownCamera,
    netImpact: TopDownEffects['netImpact'],
  ): void {
    const netDepth = -2; // behind the goal line
    const postHeight = 2.44;

    // Where the ball hit pushes the net further back, tailing off with
    // distance across the mouth — the ball bulging the mesh.
    const backOffset = (x: number): number => {
      if (!netImpact) return netDepth;
      const d2 = (x - netImpact.at.x) ** 2;
      return netDepth - netImpact.strength * 1.6 * Math.exp(-d2 / 2.2);
    };

    const leftBase = projectGround({ x: -GOAL_HALF_WIDTH, y: 0 }, cam);
    const rightBase = projectGround({ x: GOAL_HALF_WIDTH, y: 0 }, cam);
    const leftBack = projectGround({ x: -GOAL_HALF_WIDTH, y: backOffset(-GOAL_HALF_WIDTH) }, cam);
    const rightBack = projectGround({ x: GOAL_HALF_WIDTH, y: backOffset(GOAL_HALF_WIDTH) }, cam);

    // Net floor, faintly shaded so the mouth reads as a cavity.
    g.poly([
      leftBase.sx, leftBase.sy,
      rightBase.sx, rightBase.sy,
      rightBack.sx, rightBack.sy,
      leftBack.sx, leftBack.sy,
    ]).fill({ color: 0x0a1a12, alpha: 0.55 });

    // Net mesh, each strand pushed back by the bulge at its x.
    for (let i = 0; i <= 8; i += 1) {
      const t = i / 8;
      const x = -GOAL_HALF_WIDTH + GOAL_HALF_WIDTH * 2 * t;
      const a = projectGround({ x, y: 0 }, cam);
      const b = projectGround({ x, y: backOffset(x) }, cam);
      g.moveTo(a.sx, a.sy).lineTo(b.sx, b.sy);
    }
    g.stroke({ width: 1, color: LINE, alpha: 0.28 });

    // Frame: the crossbar lifted off the ground gives the goal its height.
    const lift = heightPx(postHeight, cam);
    g.moveTo(leftBase.sx, leftBase.sy - lift)
      .lineTo(leftBase.sx, leftBase.sy)
      .moveTo(rightBase.sx, rightBase.sy - lift)
      .lineTo(rightBase.sx, rightBase.sy)
      .moveTo(leftBase.sx, leftBase.sy - lift)
      .lineTo(rightBase.sx, rightBase.sy - lift)
      .stroke({ width: 3, color: GOAL_FRAME, alpha: 1 });
  }

  // ------------------------------------------------------------- figures

  private drawFigures(cam: TopDownCamera, scene: TopDownScene): void {
    this.shadows.clear();
    this.actors.removeChildren().forEach((c) => c.destroy());

    // Painter's order: furthest up the pitch (smallest y) drawn first, so
    // nearer figures overlap them.
    const all: Figure[] = [scene.keeper, ...scene.defenders, ...scene.teammates, scene.player];
    all.sort((a, b) => a.at.y - b.at.y);

    for (const figure of all) {
      const ground = projectGround(figure.at, cam);
      // Shadow, offset by the figure's height so it sits on the grass.
      this.shadows
        .ellipse(ground.sx, ground.sy, cam.scale * 0.55, cam.scale * 0.55 * cam.depthScale)
        .fill({ color: SHADOW, alpha: 0.3 });

      this.actors.addChild(this.buildFigure(figure, cam));
    }
  }

  /**
   * One player, seen from above and behind.
   *
   * Built to read as a footballer at ~20px tall, which means a clear
   * silhouette over decoration: shoulders wider than hips, a dark outline so
   * the figure lifts off the grass, and a head shifted the way he faces so a
   * pitch of players is not a field of identical backs.
   */
  private buildFigure(figure: Figure, cam: TopDownCamera): Container {
    const c = new Container();
    const ground = projectGround(figure.at, cam);
    const lift = heightPx(figure.height ?? 0, cam);
    c.position.set(ground.sx, ground.sy - lift);

    const s = cam.scale;
    const torsoH = heightPx(1.2, cam);
    const shoulderW = s * 0.68;
    const hipW = s * 0.5;
    const outline = { width: Math.max(1, s * 0.05), color: OUTLINE, alpha: 0.5 };

    // Facing, in screen space, from the figure towards what it looks at.
    let fx = 0;
    let fy = -1;
    if (figure.face) {
      const target = projectGround(figure.face, cam);
      const dx = target.sx - ground.sx;
      const dy = target.sy - (ground.sy - lift);
      const len = Math.hypot(dx, dy) || 1;
      fx = dx / len;
      fy = dy / len;
    }

    const g = new Graphics();

    // Shorts and legs at the base.
    g.roundRect(-hipW / 2, -torsoH * 0.36, hipW, torsoH * 0.42, hipW * 0.28)
      .fill(figure.kit.secondary)
      .stroke(outline);

    // Torso: shoulders tapering to the hips.
    g.moveTo(-shoulderW / 2, -torsoH)
      .lineTo(shoulderW / 2, -torsoH)
      .lineTo(hipW * 0.55, -torsoH * 0.3)
      .lineTo(-hipW * 0.55, -torsoH * 0.3)
      .closePath()
      .fill(figure.kit.primary)
      .stroke(outline);

    // A collar dab of the secondary colour, so similar kits still separate.
    g.roundRect(-shoulderW * 0.28, -torsoH, shoulderW * 0.56, torsoH * 0.16, torsoH * 0.06).fill(
      figure.kit.secondary,
    );

    // Head, shifted towards the facing direction so he is looking somewhere.
    const headR = s * 0.24;
    const headX = fx * headR * 0.35;
    const headY = -torsoH - headR * 0.55 + fy * headR * 0.35;

    // Hair sits behind the head, away from the face.
    if (figure.appearance.hairStyle !== 'bald') {
      g.circle(headX - fx * headR * 0.28, headY - fy * headR * 0.28, headR * 1.04).fill(
        hairColour(figure.appearance),
      );
    }
    g.circle(headX, headY, headR).fill(skinColour(figure.appearance)).stroke({
      width: Math.max(1, s * 0.04),
      color: OUTLINE,
      alpha: 0.4,
    });

    c.addChild(g);
    return c;
  }

  // ---------------------------------------------------------------- ball

  private drawBall(cam: TopDownCamera, scene: TopDownScene): void {
    const g = this.ball.clear();
    const ground = projectGround(scene.ball, cam);
    const lift = heightPx(scene.ballHeight, cam);
    const r = Math.max(3, cam.scale * 0.16);

    // Shadow stays on the grass; it shrinks as the ball climbs.
    const shrink = 1 / (1 + scene.ballHeight * 0.2);
    g.ellipse(ground.sx, ground.sy, r * shrink, r * shrink * cam.depthScale).fill({
      color: SHADOW,
      alpha: 0.32,
    });

    g.circle(ground.sx, ground.sy - lift, r).fill('#f8fbf9');
    g.circle(ground.sx, ground.sy - lift, r * 0.34).fill('#14202a');
  }

  // --------------------------------------------------------------- arrow

  private drawArrow(cam: TopDownCamera, scene: TopDownScene): void {
    const g = this.arrow.clear();
    const aim = scene.aim;
    if (!aim) return;

    const lengthM = 5 + aim.power * 22;
    const from = projectGround(scene.ball, cam);
    const to = projectGround(
      { x: scene.ball.x + aim.dir.x * lengthM, y: scene.ball.y + aim.dir.y * lengthM },
      cam,
    );

    const colour = ARROW_COLOUR[aim.kind] ?? 0xffffff;
    const dx = to.sx - from.sx;
    const dy = to.sy - from.sy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const head = 10 + aim.power * 8;

    g.moveTo(from.sx, from.sy)
      .lineTo(to.sx, to.sy)
      .stroke({ width: 4 + aim.power * 3, color: colour, alpha: 0.9 });

    // Arrowhead.
    g.poly([
      to.sx, to.sy,
      to.sx - ux * head - uy * head * 0.5, to.sy - uy * head + ux * head * 0.5,
      to.sx - ux * head + uy * head * 0.5, to.sy - uy * head - ux * head * 0.5,
    ]).fill({ color: colour, alpha: 0.95 });
  }
}

export type { Kit, Appearance };
