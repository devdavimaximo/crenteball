import { useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_APPEARANCE } from '@/engine/domain/appearance';
import { createRng, deriveSeed } from '@/engine/rng';
import { classifyAction, resolveAction } from '@/engine/sim/action';
import type { ActionResult, PlayerSkills } from '@/engine/sim/action';
import { generateMatchMoment } from '@/engine/sim/spatialMoment';
import type { KeyMomentType, MatchMoment } from '@/engine/sim/spatialMoment';
import { buildScene } from '@/render/buildScene';
import { topDownCamera } from '@/render/topdown';
import { sampleActionAnimation } from '@/render/topdownAnimation';
import type { AimIndicator } from '@/render/topdownScene';
import { t } from '@/ui/i18n';
import { animationSpecFor } from '@/ui/match/animationSpec';
import { defaultSlingConfig, previewSling, readSling } from '@/ui/match/slingControl';
import type { ScreenPoint } from '@/ui/match/slingControl';
import { useTopDownRenderer } from '@/ui/match/useTopDownRenderer';

/**
 * Interactive control demo (slice D): pull back from the ball and release. The
 * arrow shows where the ball will go and colours itself by what the aim would
 * do — green to shoot, blue to pass, amber to cross. Grows into the real match
 * in slice F; for now it exists to feel the slingshot on a phone.
 */

const KITS = {
  player: { primary: '#c8102e', secondary: '#f2f2f2' },
  opponent: { primary: '#1c2431', secondary: '#39445a' },
  keeper: { primary: '#f0b429', secondary: '#7a5a12' },
};

const SKILLS: PlayerSkills = {
  finishing: 62,
  passing: 62,
  dribbling: 58,
  composure: 55,
  keeperRating: 52,
};

const PRESETS: readonly KeyMomentType[] = ['shot', 'through-ball', 'cross', 'dribble'];

const OUTCOME_LABEL: Record<string, string> = {
  shot: 'match.moment.shot',
  pass: 'match.moment.through-ball',
  cross: 'match.moment.cross',
  'through-ball': 'match.moment.through-ball',
};

export function TopDownPlay() {
  const [presetIndex, setPresetIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [aim, setAim] = useState<AimIndicator | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  const dragStart = useRef<ScreenPoint | null>(null);
  const animating = useRef(false);
  const frameRef = useRef<number | null>(null);

  const moment: MatchMoment = useMemo(() => {
    const type = PRESETS[presetIndex % PRESETS.length] ?? 'shot';
    return generateMatchMoment(type, 30, presetIndex, createRng(deriveSeed(20260721, presetIndex)));
  }, [presetIndex]);

  const scene = useMemo(
    () =>
      buildScene({
        moment,
        appearance: DEFAULT_APPEARANCE,
        kits: KITS,
        rng: createRng(deriveSeed(7, presetIndex)),
        aim,
      }),
    [moment, aim, presetIndex],
  );

  const { containerRef, renderImperative } = useTopDownRenderer(scene);

  const cameraFor = () => {
    const el = containerRef.current;
    const rect = el?.getBoundingClientRect() ?? { width: 390, height: 780 };
    return topDownCamera(moment.ball, { width: rect.width, height: rect.height });
  };

  const config = defaultSlingConfig(containerRef.current?.clientHeight ?? 780);

  const localPoint = (e: React.PointerEvent): ScreenPoint => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };

  /** Plays the ball flight, then reports the outcome to React. */
  const playAction = (outcome: ActionResult, power: number) => {
    animating.current = true;
    const spec = animationSpecFor(moment.ball, outcome, power);
    const base = buildScene({
      moment,
      appearance: DEFAULT_APPEARANCE,
      kits: KITS,
      rng: createRng(deriveSeed(7, presetIndex)),
      aim: null,
    });

    const startedAt = performance.now();
    const tick = (now: number) => {
      const frame = sampleActionAnimation(spec, now - startedAt);
      // Pan the camera towards the ball as it travels, so a shot reveals the
      // goal instead of leaving it off the edge.
      const focus = {
        x: moment.ball.x + (frame.ball.x - moment.ball.x) * 0.6,
        y: moment.ball.y + (frame.ball.y - moment.ball.y) * 0.6,
      };
      renderImperative(
        { ...base, focus, ball: { x: frame.ball.x, y: frame.ball.y }, ballHeight: frame.ball.h },
        {
          trail: frame.trail,
          turf: frame.turf,
          netImpact: frame.netImpact,
          shakeX: frame.shakeX,
          shakeY: frame.shakeY,
          flash: frame.flash,
        },
      );
      if (frame.done) {
        animating.current = false;
        setResult(outcome);
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  };

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (animating.current) return;
    if (result) {
      // Tap after a result: next situation.
      setResult(null);
      setPresetIndex((i) => i + 1);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = localPoint(e);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current || result || animating.current) return;
    const reading = previewSling(dragStart.current, localPoint(e), cameraFor(), config);
    const kind = classifyAction(moment, { dir: reading.dir, power: reading.power });
    setAim({ dir: reading.dir, power: reading.power, kind });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const start = dragStart.current;
    dragStart.current = null;
    setAim(null);
    if (!start || result || animating.current) return;

    const reading = readSling(start, localPoint(e), cameraFor(), config);
    if (!reading) return; // cancelled pull

    const outcome = resolveAction(
      moment,
      { dir: reading.dir, power: reading.power },
      SKILLS,
      0.4,
      createRng(deriveSeed(20260721, presetIndex, attempt)),
    );
    setAttempt((a) => a + 1);
    playAction(outcome, reading.power);
  };

  return (
    <main className="relative h-full touch-none select-none bg-noite-950">
      <div
        ref={containerRef}
        className="h-full w-full"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3 text-white">
        <span className="eyebrow text-white/50">{t(`match.moment.${moment.type}` as never)}</span>
        <span className="text-xs text-white/45">{t('shot.hint')}</span>
      </div>

      {result && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 text-center">
          <p
            className={`text-verdict drop-shadow-lg ${
              result.goal ? 'text-relva-300' : 'text-white'
            }`}
          >
            {result.goal
              ? t('shot.outcome.goal')
              : t((OUTCOME_LABEL[result.kind] ?? 'match.moment.shot') as never)}
          </p>
          <p className="mt-1 text-xs text-white/50">{t('match.tapToContinue')}</p>
        </div>
      )}
    </main>
  );
}
