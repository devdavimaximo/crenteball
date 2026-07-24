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
import type { Figure, Kit, TopDownScene } from './topdownScene';

const GRASS_DARK = '#166b3d';
const GRASS_LIGHT = '#1c7a45';
const LINE = 0xf1f7f3;
const GOAL_FRAME = 0xf6faf8;
const SHADOW = 0x061206;

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

  private readonly grass = new Graphics();
  private readonly markings = new Graphics();
  private readonly shadows = new Graphics();
  private readonly actors = new Container();
  private readonly ball = new Graphics();
  private readonly arrow = new Graphics();

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

    app.stage.addChild(this.grass, this.markings, this.shadows, this.actors, this.ball, this.arrow);
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

  render(scene: TopDownScene): void {
    if (!this.app) return;
    const cam = topDownCamera(scene.focus, this.viewport);

    this.drawGrass(cam);
    this.drawMarkings(cam);
    this.drawFigures(cam, scene);
    this.drawBall(cam, scene);
    this.drawArrow(cam, scene);

    this.renderNow();
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

  private drawMarkings(cam: TopDownCamera): void {
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

    this.drawGoal(g, cam);
  }

  /**
   * The goal, given a little depth: the net extends behind the line (towards
   * the top of the screen) and the frame stands up off the ground.
   */
  private drawGoal(g: Graphics, cam: TopDownCamera): void {
    const netDepth = -2; // behind the goal line
    const postHeight = 2.44;

    const leftBase = projectGround({ x: -GOAL_HALF_WIDTH, y: 0 }, cam);
    const rightBase = projectGround({ x: GOAL_HALF_WIDTH, y: 0 }, cam);
    const leftBack = projectGround({ x: -GOAL_HALF_WIDTH, y: netDepth }, cam);
    const rightBack = projectGround({ x: GOAL_HALF_WIDTH, y: netDepth }, cam);

    // Net floor, faintly shaded so the mouth reads as a cavity.
    g.poly([
      leftBase.sx, leftBase.sy,
      rightBase.sx, rightBase.sy,
      rightBack.sx, rightBack.sy,
      leftBack.sx, leftBack.sy,
    ]).fill({ color: 0x0a1a12, alpha: 0.55 });

    // Net mesh.
    for (let i = 0; i <= 8; i += 1) {
      const t = i / 8;
      const x = -GOAL_HALF_WIDTH + GOAL_HALF_WIDTH * 2 * t;
      const a = projectGround({ x, y: 0 }, cam);
      const b = projectGround({ x, y: netDepth }, cam);
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

  /** One player: a shadow-grounded body with a head, in kit colours. */
  private buildFigure(figure: Figure, cam: TopDownCamera): Container {
    const c = new Container();
    const ground = projectGround(figure.at, cam);
    const lift = heightPx(figure.height ?? 0, cam);
    c.position.set(ground.sx, ground.sy - lift);

    const bodyH = heightPx(1.5, cam);
    const bodyW = cam.scale * 0.62;
    const g = new Graphics();

    // Torso: a rounded jersey from the hips up.
    g.roundRect(-bodyW / 2, -bodyH, bodyW, bodyH * 0.72, bodyW * 0.32).fill(figure.kit.primary);
    // A shoulder band in the secondary colour, so kits read apart.
    g.rect(-bodyW / 2, -bodyH, bodyW, bodyH * 0.16).fill(figure.kit.secondary);
    // Shorts.
    g.roundRect(-bodyW / 2, -bodyH * 0.34, bodyW, bodyH * 0.3, bodyW * 0.2).fill(
      figure.kit.secondary,
    );
    // Head.
    g.circle(0, -bodyH - bodyW * 0.16, bodyW * 0.34).fill(skinColour(figure.appearance));
    // A dab of hair on the crown, seen from above-behind.
    if (figure.appearance.hairStyle !== 'bald') {
      g.circle(0, -bodyH - bodyW * 0.24, bodyW * 0.3).fill(hairColour(figure.appearance));
    }

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
