/**
 * Turns a resolved action into a ball-flight spec the animation can play.
 *
 * The engine decided what happened; this decides where the ball visibly ends
 * up and how it gets there — a driven shot into the net, a lofted cross, a
 * ground pass cut out in the lane. Presentation only: it never changes the
 * outcome, just shows it.
 */
import { GOAL_HALF_WIDTH } from '@/engine/balance/shot';
import type { Point } from '@/engine/domain/pitch';
import type { ActionResult } from '@/engine/sim/action';
import type { ActionAnimationSpec, FlightOutcome } from '@/render/topdownAnimation';

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function animationSpecFor(
  from: Point,
  result: ActionResult,
  power: number,
): ActionAnimationSpec {
  const goalCentre: Point = { x: 0, y: 0 };

  if (result.kind === 'shot' && result.shot) {
    const shot = result.shot;
    const x = shot.targetX;

    let to: Point;
    let outcome: FlightOutcome;
    switch (shot.outcome) {
      case 'goal':
        to = { x: Math.max(-3.3, Math.min(3.3, x)), y: -1.4 };
        outcome = 'goal';
        break;
      case 'saved':
        to = { x: x * 0.55, y: 0.7 };
        outcome = 'saved';
        break;
      case 'post':
        to = { x: Math.sign(x || 1) * GOAL_HALF_WIDTH, y: 0.2 };
        outcome = 'post';
        break;
      case 'off-target':
        to = { x: x * 1.18, y: -0.6 };
        outcome = 'off';
        break;
      case 'blocked':
        to = lerp(from, goalCentre, 0.42);
        outcome = 'blocked';
        break;
    }

    // A shot rises a little; a harder one drives flatter and faster.
    return { from, to, peakHeight: 0.5 + power * 1.4, outcome, goal: result.goal, power };
  }

  // A pass, cross or ball into space.
  const pass = result.pass;
  const to = pass?.end ?? goalCentre;
  const peakHeight = result.kind === 'cross' ? 3.6 : result.kind === 'pass' ? 0.5 : 0.15;
  const outcome: FlightOutcome = pass?.outcome ?? 'complete';

  return { from, to, peakHeight, outcome, goal: result.goal, power };
}
