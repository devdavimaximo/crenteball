import { useEffect, useRef } from 'react';

import { DEFAULT_APPEARANCE } from '@/engine/domain/appearance';
import { directionTo } from '@/engine/domain/pitch';
import { createRng } from '@/engine/rng';
import { classifyAction } from '@/engine/sim/action';
import { generateMatchMoment } from '@/engine/sim/spatialMoment';
import type { KeyMomentType } from '@/engine/sim/spatialMoment';
import { buildScene } from '@/render/buildScene';
import { PixiTopDownRenderer } from '@/render/PixiTopDownRenderer';
import { sampleActionAnimation } from '@/render/topdownAnimation';
import type { ActionAnimationSpec } from '@/render/topdownAnimation';
import type { AimIndicator } from '@/render/topdownScene';

/**
 * Dev harness for the top-down renderer (slice C). Reached at
 * `#topdown&scene=N`; Playwright screenshots it so the WebGL output can be
 * judged headlessly. Superseded by the real match screen in slice F.
 */

const KITS = {
  player: { primary: '#c8102e', secondary: '#f2f2f2' },
  opponent: { primary: '#1c2431', secondary: '#39445a' },
  keeper: { primary: '#f0b429', secondary: '#7a5a12' },
};

const PRESETS: { type: KeyMomentType; aim: 'shot' | 'pass' | null }[] = [
  { type: 'shot', aim: 'shot' },
  { type: 'through-ball', aim: 'pass' },
  { type: 'cross', aim: null },
  { type: 'dribble', aim: null },
];

function sceneIndex(): number {
  const match = /scene=(\d+)/.exec(window.location.hash);
  return match ? Number(match[1]) : 0;
}

export function TopDownPreview() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const preset = PRESETS[sceneIndex() % PRESETS.length] ?? PRESETS[0]!;
    const rng = createRng(20260721);
    const moment = generateMatchMoment(preset.type, 30, 0, rng);

    let aim: AimIndicator | null = null;
    if (preset.aim === 'shot') {
      const dir = directionTo(moment.ball, { x: 0, y: 0 });
      aim = { dir, power: 0.7, kind: classifyAction(moment, { dir, power: 0.7 }) };
    } else if (preset.aim === 'pass' && moment.teammates[0]) {
      const dir = directionTo(moment.ball, moment.teammates[0].point);
      aim = { dir, power: 0.5, kind: classifyAction(moment, { dir, power: 0.5 }) };
    }

    const scene = buildScene({
      moment,
      appearance: DEFAULT_APPEARANCE,
      kits: KITS,
      rng: createRng(7),
      aim,
    });

    // Animation-frame mode: `#topdown&anim=1&t=300` renders one deterministic
    // frame of a goal at elapsed t, so the juice can be screenshotted.
    const animT = /anim=1/.test(window.location.hash)
      ? Number(/t=(\d+)/.exec(window.location.hash)?.[1] ?? 0)
      : null;
    const goalSpec: ActionAnimationSpec = {
      from: moment.ball,
      to: { x: 1.6, y: -1.4 },
      peakHeight: 1.6,
      outcome: 'goal',
      goal: true,
      power: 0.78,
    };

    const renderer = new PixiTopDownRenderer();
    let disposed = false;

    const rect = container.getBoundingClientRect();
    void renderer
      .init(container, rect.width, rect.height, window.devicePixelRatio || 1)
      .then(() => {
        if (disposed) {
          renderer.destroy();
          return;
        }
        if (animT === null) {
          renderer.render(scene);
        } else {
          const frame = sampleActionAnimation(goalSpec, animT);
          const focus = {
            x: moment.ball.x + (frame.ball.x - moment.ball.x) * 0.6,
            y: moment.ball.y + (frame.ball.y - moment.ball.y) * 0.6,
          };
          renderer.render(
            {
              ...scene,
              focus,
              aim: null,
              ball: { x: frame.ball.x, y: frame.ball.y },
              ballHeight: frame.ball.h,
            },
            {
              trail: frame.trail,
              turf: frame.turf,
              netImpact: frame.netImpact,
              shakeX: frame.shakeX,
              shakeY: frame.shakeY,
              flash: frame.flash,
            },
          );
        }
        container.dataset.ready = 'true';
      });

    return () => {
      disposed = true;
      renderer.destroy();
    };
  }, []);

  return <div ref={containerRef} data-topdown className="h-full w-full" />;
}
