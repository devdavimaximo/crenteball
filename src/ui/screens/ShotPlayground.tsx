import { useCallback, useMemo, useRef, useState } from 'react';

import { GOAL_HALF_WIDTH, GOAL_HEIGHT } from '@/engine/balance/shot';
import { createRng, deriveSeed } from '@/engine/rng';
import { aimingError, chanceQuality, resolveShot } from '@/engine/sim/shot';
import type { ShotContext, ShotOutcome } from '@/engine/sim/shot';
import { matchPerformance } from '@/engine/systems/rating';
import type { RatedShot } from '@/engine/systems/rating';
import { cameraFor, depthOf, unprojectAtDepth } from '@/render/projection';
import type { DefenderMarker, ShotScene } from '@/render/types';
import { MatchHud } from '@/ui/match/MatchHud';
import { defaultSwipeConfig, previewSwipe, readSwipe } from '@/ui/match/shotControl';
import type { SwipeSample } from '@/ui/match/shotControl';
import { useMatchScene } from '@/ui/match/useMatchScene';
import { t } from '@/ui/i18n';

/**
 * Practice range: the same shot, as many times as you like.
 *
 * The real match (`#partida`) is the milestone; this exists for tuning, where
 * you want the identical 28-metre chance twenty times in a row to judge how
 * the power curve feels. Shares the canvas hook with the match so the two can
 * never drift apart.
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
  const samplesRef = useRef<SwipeSample[]>([]);

  const [presetIndex, setPresetIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [aim, setAim] = useState<ShotScene['aim']>(null);
  const [power, setPower] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  /** Every shot of the session, so the rating is recomputed, never nudged. */
  const [history, setHistory] = useState<RatedShot[]>([]);

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
      ballFlight: null,
      keeperPose: null,
      effects: null,
      kit: KIT,
    }),
    [preset, aim, result],
  );

  // Canvas, renderer and animation clock all live in the shared hook — the
  // same one the real match uses, so the two screens cannot drift apart.
  const { canvasRef, playShot, isAnimating } = useMatchScene(scene);

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
    [canvasRef, preset],
  );

  const swipeConfig = defaultSwipeConfig(canvasRef.current?.clientHeight ?? 640);

  const animating = isAnimating;

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (animating()) return; // the ball is in the air — let it land
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
    if (samplesRef.current.length === 0 || result || animating()) return;
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
    if (result || animating() || samples.length === 0) return;

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

    const nearestDefender = preset.defenders.reduce(
      (nearest, defender) => Math.min(nearest, defender.depth),
      preset.distance * 0.5,
    );

    playShot(
      {
        distance: preset.distance,
        angle: preset.angle,
        targetX: shot.targetX,
        targetY: shot.targetY,
        outcome: shot.outcome,
        power: reading.power,
        keeperX: 0.4,
        blockDepth: nearestDefender,
      },
      scene,
      () => {
        setHistory((shots) => [
          ...shots,
          { outcome: shot.outcome, quality: chanceQuality(shotContext) },
        ]);
        setResult({ outcome: shot.outcome, markX: shot.targetX, markY: shot.targetY });
      },
    );
  };

  // Named `stats`, not `performance`: that shadows the global used by
  // performance.now() in the swipe and animation clocks.
  const stats = matchPerformance(history);
  // Stand-in match state until M3.7 runs a real fixture: the clock advances
  // with each attempt and the opponent is a fixed 1, so the HUD can be judged
  // against a scoreline that changes.
  const minute = Math.min(90, 6 + history.length * 11);
  const energy = Math.max(20, 100 - history.length * 6);

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

      <MatchHud
        homeShort="AGU"
        awayShort="SLM"
        homeGoals={stats.goals}
        awayGoals={1}
        minute={minute}
        energy={energy}
        rating={stats.rating}
      />

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-4 pb-5">
        <button
          type="button"
          className="min-h-11 rounded-full bg-white/10 px-4 text-sm font-semibold text-white"
          onClick={() => {
            setPresetIndex((i) => i + 1);
            setResult(null);
            setAim(null);
          }}
        >
          {preset.label} ↻
        </button>
        <span className="text-xs text-white/50">
          {t('shot.tally', { goals: stats.goals, shots: stats.shots })}
        </span>
      </div>

      {/* Power bar, only while charging. */}
      {aim && (
        <div className="pointer-events-none absolute bottom-20 left-1/2 h-2 w-40 -translate-x-1/2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full bg-relva-300" style={{ width: `${String(power * 100)}%` }} />
        </div>
      )}

      {/* Outcome + hint. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-24 text-center">
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
