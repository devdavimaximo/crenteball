import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { GOAL_HALF_WIDTH, GOAL_HEIGHT } from '@/engine/balance/shot';
import { createRng, deriveSeed } from '@/engine/rng';
import { aimingError, resolveShot } from '@/engine/sim/shot';
import type { ShotContext, ShotOutcome } from '@/engine/sim/shot';
import { cameraFor, depthOf, unprojectAtDepth } from '@/render/projection';
import { CanvasShotRenderer } from '@/render/shotSceneRenderer';
import type { DefenderMarker, ShotScene } from '@/render/types';
import { defaultSwipeConfig, previewSwipe, readSwipe } from '@/ui/match/shotControl';
import type { SwipeSample } from '@/ui/match/shotControl';
import { t } from '@/ui/i18n';

/**
 * The first playable slice (M3.4): swipe through the ball to shoot, engine
 * resolves it, the mark shows where it went. Grows into the real match
 * prototype in M3.7; until then it exists so the *feel* of the control can be
 * judged on a phone, which no test can do.
 */

const SEED = 20260721;
const KIT = { primary: '#c8102e', secondary: '#101010' };

interface Preset {
  readonly label: string;
  readonly distance: number;
  readonly angle: number;
  readonly defenders: readonly DefenderMarker[];
  readonly pressure: number;
}

const PRESETS: readonly Preset[] = [
  { label: 'Pênalti', distance: 11, angle: 0, defenders: [], pressure: 0.8 },
  { label: 'Cara a cara', distance: 7, angle: -12, defenders: [{ x: -1.2, depth: 3 }], pressure: 0.3 },
  {
    label: 'Borda da área',
    distance: 17,
    angle: 18,
    defenders: [
      { x: 0.4, depth: 6 },
      { x: -1.8, depth: 9 },
    ],
    pressure: 0.2,
  },
  {
    label: 'De longe',
    distance: 28,
    angle: -25,
    defenders: [
      { x: -2.2, depth: 8 },
      { x: 0.8, depth: 13 },
    ],
    pressure: 0.2,
  },
];

const OUTCOME_KEY = {
  goal: 'shot.outcome.goal',
  saved: 'shot.outcome.saved',
  post: 'shot.outcome.post',
  'off-target': 'shot.outcome.offTarget',
  blocked: 'shot.outcome.blocked',
} as const;

interface Result {
  readonly outcome: ShotOutcome;
  readonly markX: number;
  readonly markY: number;
}

export function ShotPlayground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasShotRenderer | null>(null);
  const samplesRef = useRef<SwipeSample[]>([]);

  const [presetIndex, setPresetIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [aim, setAim] = useState<ShotScene['aim']>(null);
  const [power, setPower] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [tally, setTally] = useState({ shots: 0, goals: 0 });

  const preset = PRESETS[presetIndex % PRESETS.length] as Preset;

  const shotContext: ShotContext = useMemo(
    () => ({
      distance: preset.distance,
      angle: preset.angle,
      defenders: preset.defenders.length,
      finishing: 55,
      dribbling: 50,
      composure: 50,
      pressure: preset.pressure,
      keeperRating: 50,
    }),
    [preset],
  );

  const scene: ShotScene = useMemo(
    () => ({
      distance: preset.distance,
      angle: preset.angle,
      defenders: preset.defenders,
      keeperX: 0.4,
      aim,
      ballMark: result ? { x: result.markX, y: result.markY } : null,
      kit: KIT,
    }),
    [preset, aim, result],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new CanvasShotRenderer();
    renderer.mount(canvas);
    rendererRef.current = renderer;

    const observer = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
      renderer.render(scene);
    });
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      renderer.destroy();
      rendererRef.current = null;
    };
    // The scene render inside the observer callback uses the latest closure
    // via the effect below; mounting is once per canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;
    const rect = canvas.getBoundingClientRect();
    renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    renderer.render(scene);
  }, [scene]);

  /** Screen point → normalised aim on the goal plane. */
  const aimFromScreen = useCallback(
    (sx: number, sy: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0.3 };
      const rect = canvas.getBoundingClientRect();
      const viewport = { width: rect.width, height: rect.height };
      const camera = cameraFor(preset.distance, preset.angle, viewport);
      // Samples carry client coordinates; the camera lives in canvas space.
      const world = unprojectAtDepth(
        sx - rect.left,
        sy - rect.top,
        depthOf(0, preset.distance, camera),
        camera,
        viewport,
      );

      // The player may aim wide or over on purpose; clamp only the absurd.
      return {
        x: Math.max(-1.5, Math.min(1.5, world.x / GOAL_HALF_WIDTH)),
        y: Math.max(0, Math.min(1.5, world.y / GOAL_HEIGHT)),
      };
    },
    [preset],
  );

  const swipeConfig = defaultSwipeConfig(canvasRef.current?.clientHeight ?? 640);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (result) {
      // Tap after a resolved shot: rearm the same situation.
      setResult(null);
      setAim(null);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    samplesRef.current = [{ x: event.clientX, y: event.clientY, t: performance.now() }];
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (samplesRef.current.length === 0 || result) return;
    samplesRef.current.push({ x: event.clientX, y: event.clientY, t: performance.now() });

    const preview = previewSwipe(samplesRef.current, swipeConfig);
    const target = aimFromScreen(preview.endX, preview.endY);
    setPower(preview.power);
    setAim({
      x: target.x,
      y: target.y,
      spreadM: aimingError(
        { aimX: target.x, aimY: target.y, power: preview.power, curve: 0 },
        shotContext,
      ),
    });
  };

  const onPointerUp = () => {
    const samples = samplesRef.current;
    samplesRef.current = [];
    if (result || samples.length === 0) return;

    const reading = readSwipe(samples, swipeConfig);
    setAim(null);
    setPower(0);
    if (!reading) return; // a tap or a hesitation is a cancel, not a shot

    const target = aimFromScreen(reading.endX, reading.endY);
    const rng = createRng(deriveSeed(SEED, 'playground', presetIndex, attempt));
    const shot = resolveShot(
      { aimX: target.x, aimY: target.y, power: reading.power, curve: 0 },
      shotContext,
      rng,
    );

    setAttempt((n) => n + 1);
    setTally((c) => ({ shots: c.shots + 1, goals: c.goals + (shot.outcome === 'goal' ? 1 : 0) }));
    setResult({ outcome: shot.outcome, markX: shot.targetX, markY: shot.targetY });
  };

  return (
    <main className="relative h-full touch-none select-none">
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3 text-white">
        <button
          type="button"
          className="pointer-events-auto min-h-11 rounded-full bg-white/10 px-4 text-sm font-semibold"
          onClick={() => {
            setPresetIndex((i) => i + 1);
            setResult(null);
            setAim(null);
          }}
        >
          {preset.label} ↻
        </button>
        <span className="text-xs text-white/60">
          {t('shot.tally', { goals: tally.goals, shots: tally.shots })}
        </span>
      </div>

      {/* Power bar, only while charging. */}
      {aim && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 h-2 w-40 -translate-x-1/2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full bg-relva-300" style={{ width: `${String(power * 100)}%` }} />
        </div>
      )}

      {/* Outcome + hint. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-12 text-center">
        {result ? (
          <p className="text-2xl font-black text-white drop-shadow">
            {t(OUTCOME_KEY[result.outcome])}
          </p>
        ) : (
          !aim && <p className="text-sm text-white/50">{t('shot.hint')}</p>
        )}
        {result && <p className="mt-1 text-xs text-white/50">{t('shot.again')}</p>}
      </div>
    </main>
  );
}
