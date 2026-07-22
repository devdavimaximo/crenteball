import { useCallback, useMemo, useRef, useState } from 'react';

import { GOAL_HALF_WIDTH, GOAL_HEIGHT } from '@/engine/balance/shot';
import { createRng, deriveSeed } from '@/engine/rng';
import { aimingError, chanceQuality, resolveShot } from '@/engine/sim/shot';
import type { ShotContext } from '@/engine/sim/shot';
import { matchPerformance } from '@/engine/systems/rating';
import type { RatedShot } from '@/engine/systems/rating';
import {
  MATCH_MINUTES,
  finalScore,
  planMatch,
  playerMatchRngFor,
  pressureFor,
  scoreAt,
} from '@/engine/systems/playerMatch';
import { cameraFor, depthOf, unprojectAtDepth } from '@/render/projection';
import type { ShotScene } from '@/render/types';
import { t } from '@/ui/i18n';
import type { TranslationKey } from '@/ui/i18n';
import { MatchHud } from '@/ui/match/MatchHud';
import { defaultSwipeConfig, previewSwipe, readSwipe } from '@/ui/match/shotControl';
import type { SwipeSample } from '@/ui/match/shotControl';
import { useMatchScene } from '@/ui/match/useMatchScene';

/**
 * The M3 milestone: a whole match, played through its key moments.
 *
 * The fixture is planned up front by the engine — his moments, and when the
 * other twenty-one players score. The screen walks through it; the only thing
 * it decides is nothing. A devotion slider sits in the corner so the faith
 * mechanic can be *felt* during playtesting, which is the point of this page.
 */

const CLUB = { short: 'AGU', name: 'Atlético Guanabara', primary: '#c8102e' };
const OPPONENT = { short: 'SLM', name: 'São Luís Maranhense' };

const SETUP = {
  position: 'FW',
  teamStrength: 62,
  opponentStrength: 54,
  isHome: true,
  energy: 100,
} as const;

const PLAYER = { finishing: 58, dribbling: 52, keeperRating: 52 };

type Phase = 'intro' | 'aiming' | 'outcome' | 'fulltime';

interface Shot {
  readonly outcome: RatedShot['outcome'];
  readonly markX: number;
  readonly markY: number;
}

export function MatchPrototype() {
  const [matchSeed, setMatchSeed] = useState(1);
  const [devotion, setDevotion] = useState(50);

  const plan = useMemo(
    () => planMatch(SETUP, playerMatchRngFor(20260721, 1, matchSeed, 'davi')),
    [matchSeed],
  );

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('intro');
  const [history, setHistory] = useState<RatedShot[]>([]);
  const [goalMinutes, setGoalMinutes] = useState<number[]>([]);
  const [shot, setShot] = useState<Shot | null>(null);
  const [aim, setAim] = useState<ShotScene['aim']>(null);
  const [power, setPower] = useState(0);

  const samplesRef = useRef<SwipeSample[]>([]);

  const moment = plan.moments[Math.min(index, plan.moments.length - 1)];
  const stats = matchPerformance(history);
  const minute = phase === 'fulltime' || !moment ? MATCH_MINUTES : moment.minute;
  const score = scoreAt(plan, goalMinutes, minute);
  const energy = Math.max(15, SETUP.energy - index * 9);

  const pressure = moment ? pressureFor(plan, goalMinutes, moment) : 0;

  const shotContext: ShotContext = useMemo(
    () => ({
      distance: moment?.distance ?? 16,
      angle: moment?.angle ?? 0,
      defenders: moment?.defenders ?? 1,
      finishing: PLAYER.finishing,
      dribbling: PLAYER.dribbling,
      // Provisional mapping: devotion *is* composure until the faith system
      // lands in M4 and derives it properly from devotion plus morale.
      composure: devotion,
      pressure,
      keeperRating: PLAYER.keeperRating,
    }),
    [moment, devotion, pressure],
  );

  const scene: ShotScene = useMemo(
    () => ({
      distance: moment?.distance ?? 16,
      angle: moment?.angle ?? 0,
      defenders: Array.from({ length: moment?.defenders ?? 0 }, (_, i) => ({
        x: (i - 1) * 1.6,
        depth: 4 + i * 3,
      })),
      keeperX: 0.3,
      aim: phase === 'aiming' ? aim : null,
      ballMark: shot ? { x: shot.markX, y: shot.markY } : null,
      ballFlight: null,
      keeperPose: null,
      effects: null,
      kit: { primary: CLUB.primary, secondary: '#101010' },
    }),
    [moment, aim, shot, phase],
  );

  const { canvasRef, playShot, isAnimating } = useMatchScene(scene);

  const aimFromScreen = useCallback(
    (sx: number, sy: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !moment) return { x: 0, y: 0.3 };
      const rect = canvas.getBoundingClientRect();
      const viewport = { width: rect.width, height: rect.height };
      const camera = cameraFor(moment.distance, moment.angle, viewport);
      const world = unprojectAtDepth(
        sx - rect.left,
        sy - rect.top,
        depthOf(0, moment.distance, camera),
        camera,
        viewport,
      );
      return {
        x: Math.max(-1.5, Math.min(1.5, world.x / GOAL_HALF_WIDTH)),
        y: Math.max(0, Math.min(1.5, world.y / GOAL_HEIGHT)),
      };
    },
    [canvasRef, moment],
  );

  const advance = () => {
    setShot(null);
    if (index + 1 >= plan.moments.length) {
      setPhase('fulltime');
      return;
    }
    setIndex((i) => i + 1);
    setPhase('intro');
  };

  const swipeConfig = defaultSwipeConfig(canvasRef.current?.clientHeight ?? 640);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (isAnimating()) return;
    if (phase === 'intro') {
      setPhase('aiming');
      return;
    }
    if (phase === 'outcome') {
      advance();
      return;
    }
    if (phase !== 'aiming') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    samplesRef.current = [{ x: event.clientX, y: event.clientY, t: performance.now() }];
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (phase !== 'aiming' || samplesRef.current.length === 0 || isAnimating()) return;
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
    if (phase !== 'aiming' || isAnimating() || samples.length === 0 || !moment) return;

    const reading = readSwipe(samples, swipeConfig);
    setAim(null);
    setPower(0);
    if (!reading) return;

    const target = aimFromScreen(reading.endX, reading.endY);
    const rng = createRng(deriveSeed(20260721, 'shot', matchSeed, index));
    const resolved = resolveShot(
      { aimX: target.x, aimY: target.y, power: reading.power, curve: 0 },
      shotContext,
      rng,
    );

    playShot(
      {
        distance: moment.distance,
        angle: moment.angle,
        targetX: resolved.targetX,
        targetY: resolved.targetY,
        outcome: resolved.outcome,
        power: reading.power,
        keeperX: 0.3,
        blockDepth: 4,
      },
      scene,
      () => {
        setHistory((h) => [...h, { outcome: resolved.outcome, quality: chanceQuality(shotContext) }]);
        if (resolved.outcome === 'goal') setGoalMinutes((m) => [...m, moment.minute].sort((a, b) => a - b));
        setShot({ outcome: resolved.outcome, markX: resolved.targetX, markY: resolved.targetY });
        setPhase('outcome');
      },
    );
  };

  const restart = () => {
    setMatchSeed((s) => s + 1);
    setIndex(0);
    setPhase('intro');
    setHistory([]);
    setGoalMinutes([]);
    setShot(null);
  };

  const full = finalScore(plan, goalMinutes);
  const verdict =
    full.team > full.opponent ? 'match.won' : full.team === full.opponent ? 'match.drew' : 'match.lost';

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
        homeShort={CLUB.short}
        awayShort={OPPONENT.short}
        homeGoals={score.team}
        awayGoals={score.opponent}
        minute={minute}
        energy={energy}
        rating={stats.rating}
      />

      {/* Charging power. */}
      {phase === 'aiming' && aim && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 h-2 w-40 -translate-x-1/2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full bg-relva-300" style={{ width: `${String(power * 100)}%` }} />
        </div>
      )}

      {/* Moment card / outcome / hint. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-24 px-6 text-center">
        {phase === 'intro' && moment && (
          <>
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-relva-300">
              {t('match.momentOf', { n: index + 1, total: plan.moments.length })}
            </p>
            <p className="mt-1 text-2xl font-black text-white drop-shadow">
              {t(`match.moment.${moment.type}` as TranslationKey)}
            </p>
            <p className="mt-1 text-xs text-white/50">{t('match.tapToContinue')}</p>
          </>
        )}

        {phase === 'aiming' && !aim && (
          <p className="text-sm text-white/50">{t('shot.hint')}</p>
        )}

        {phase === 'outcome' && shot && (
          <>
            <p className="text-3xl font-black text-white drop-shadow">
              {t(
                (
                  {
                    goal: 'shot.outcome.goal',
                    saved: 'shot.outcome.saved',
                    post: 'shot.outcome.post',
                    'off-target': 'shot.outcome.offTarget',
                    blocked: 'shot.outcome.blocked',
                  } as const
                )[shot.outcome],
              )}
            </p>
            <p className="mt-1 text-xs text-white/50">{t('match.tapToContinue')}</p>
          </>
        )}
      </div>

      {/* Full time. */}
      {phase === 'fulltime' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-noite-950/85 px-8 text-center backdrop-blur-sm">
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-relva-300">
            {t('match.fullTime')}
          </p>
          <p className="text-5xl font-black tabular-nums text-white">
            {full.team} <span className="text-white/30">×</span> {full.opponent}
          </p>
          <p className="text-lg font-semibold text-white/80">{t(verdict)}</p>

          <dl className="mt-2 grid grid-cols-3 gap-6 text-white">
            <div>
              <dt className="text-[0.65rem] uppercase tracking-wider text-white/45">
                {t('match.yourRating')}
              </dt>
              <dd className="text-2xl font-black tabular-nums">{stats.rating.toFixed(1)}</dd>
            </div>
            <div>
              <dt className="text-[0.65rem] uppercase tracking-wider text-white/45">
                {t('match.yourGoals')}
              </dt>
              <dd className="text-2xl font-black tabular-nums">{stats.goals}</dd>
            </div>
            <div>
              <dt className="text-[0.65rem] uppercase tracking-wider text-white/45">
                {t('match.shots')}
              </dt>
              <dd className="text-2xl font-black tabular-nums">{stats.shots}</dd>
            </div>
          </dl>

          <button
            type="button"
            onClick={restart}
            className="mt-4 min-h-12 rounded-full bg-relva-500 px-8 text-sm font-bold text-white"
          >
            {t('match.playAgain')}
          </button>
        </div>
      )}

      {/* Playtest control: feel the faith mechanic. */}
      {phase !== 'fulltime' && (
        <div className="absolute inset-x-0 bottom-0 px-5 pb-5">
          <label className="flex items-center gap-3 text-[0.65rem] uppercase tracking-wider text-white/40">
            {t('match.devotionLab')}
            <input
              type="range"
              min={0}
              max={100}
              value={devotion}
              onChange={(e) => setDevotion(Number(e.target.value))}
              className="h-1 flex-1 accent-relva-500"
            />
            <span className="tabular-nums text-white/60">{devotion}</span>
          </label>
        </div>
      )}
    </main>
  );
}
