import { useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_APPEARANCE } from '@/engine/domain/appearance';
import { createRng, deriveSeed } from '@/engine/rng';
import { classifyAction, resolveAction } from '@/engine/sim/action';
import type { ActionResult, PlayerSkills } from '@/engine/sim/action';
import {
  MATCH_MINUTES,
  finalScore,
  planMatch,
  playerMatchRngFor,
  pressureFor,
  scoreAt,
} from '@/engine/systems/playerMatch';
import { matchPerformance } from '@/engine/systems/rating';
import type { RatedShot } from '@/engine/systems/rating';
import { buildScene } from '@/render/buildScene';
import { topDownCamera } from '@/render/topdown';
import { sampleActionAnimation } from '@/render/topdownAnimation';
import type { AimIndicator } from '@/render/topdownScene';
import { t } from '@/ui/i18n';
import type { TranslationKey } from '@/ui/i18n';
import { animationSpecFor } from '@/ui/match/animationSpec';
import { MatchHud } from '@/ui/match/MatchHud';
import { defaultSlingConfig, previewSling, readSling } from '@/ui/match/slingControl';
import type { ScreenPoint } from '@/ui/match/slingControl';
import { useTopDownRenderer } from '@/ui/match/useTopDownRenderer';

/**
 * The whole match, played top-down through its key moments (slice F).
 *
 * The engine plans the fixture up front — the player's moments and when the
 * other twenty-one players score — so the scoreline is never rigged around his
 * performance. He pulls back and shoots, passes or crosses; the ball flies to
 * the engine's outcome; the game moves on. A devotion slider exposes the faith
 * mechanic for playtesting.
 */

const CLUB = { short: 'AGU', primary: '#c8102e', secondary: '#f2f2f2' };
const OPPONENT = { short: 'SLM' };

const KITS = {
  player: { primary: CLUB.primary, secondary: CLUB.secondary },
  opponent: { primary: '#1c2431', secondary: '#39445a' },
  keeper: { primary: '#f0b429', secondary: '#7a5a12' },
};

const SETUP = {
  position: 'FW',
  teamStrength: 62,
  opponentStrength: 54,
  isHome: true,
  energy: 100,
} as const;

const ATTRIBUTES = { finishing: 60, passing: 60, dribbling: 56, keeperRating: 52 };

type Phase = 'intro' | 'aiming' | 'outcome' | 'fulltime';

/** Maps an action outcome to the banner shown after it settles. */
function outcomeLabel(result: ActionResult): TranslationKey {
  if (result.goal) return result.scoredByPlayer ? 'shot.outcome.goal' : 'match.outcome.assist';
  if (result.kind === 'shot') {
    const map = {
      saved: 'shot.outcome.saved',
      post: 'shot.outcome.post',
      'off-target': 'shot.outcome.offTarget',
      blocked: 'shot.outcome.blocked',
      goal: 'shot.outcome.goal',
    } as const;
    return map[result.shot?.outcome ?? 'saved'];
  }
  if (result.pass?.outcome === 'intercepted') return 'match.outcome.passFail';
  return result.kind === 'cross' ? 'match.outcome.cross' : 'match.outcome.pass';
}

/** A resolved action, as the rating sees it. Assists count like goals; giving the ball away stings. */
function ratedShotFor(result: ActionResult): RatedShot | null {
  if (result.kind === 'shot' && result.shot) {
    return { outcome: result.shot.outcome, quality: result.quality };
  }
  if (result.goal) return { outcome: 'goal', quality: result.quality };
  if (result.pass?.outcome === 'intercepted') return { outcome: 'blocked', quality: 0.35 };
  return null;
}

export function TopDownMatch() {
  const [matchSeed, setMatchSeed] = useState(1);
  const [devotion, setDevotion] = useState(50);

  const plan = useMemo(
    () => planMatch(SETUP, playerMatchRngFor(20260721, 1, matchSeed, 'davi')),
    [matchSeed],
  );

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('intro');
  const [history, setHistory] = useState<RatedShot[]>([]);
  const [playerGoalMinutes, setPlayerGoalMinutes] = useState<number[]>([]);
  const [assists, setAssists] = useState(0);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [aim, setAim] = useState<AimIndicator | null>(null);

  const dragStart = useRef<ScreenPoint | null>(null);
  const animating = useRef(false);
  const frameRef = useRef<number | null>(null);

  const moment = plan.moments[Math.min(index, plan.moments.length - 1)]!;
  const stats = matchPerformance(history);
  const minute = phase === 'fulltime' ? MATCH_MINUTES : moment.minute;
  const score = scoreAt(plan, playerGoalMinutes, minute);
  const energy = Math.max(15, SETUP.energy - index * 9);
  const pressure = pressureFor(plan, playerGoalMinutes, moment);

  const skills: PlayerSkills = useMemo(
    () => ({ ...ATTRIBUTES, composure: devotion }),
    [devotion],
  );

  const scene = useMemo(
    () =>
      buildScene({
        moment,
        appearance: DEFAULT_APPEARANCE,
        kits: KITS,
        rng: createRng(deriveSeed(7, index)),
        aim: phase === 'aiming' ? aim : null,
      }),
    [moment, index, phase, aim],
  );

  const { containerRef, renderImperative } = useTopDownRenderer(scene);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const cameraFor = () => {
    const rect = containerRef.current?.getBoundingClientRect() ?? { width: 390, height: 780 };
    return topDownCamera(moment.ball, { width: rect.width, height: rect.height });
  };
  const config = defaultSlingConfig(containerRef.current?.clientHeight ?? 780);
  const localPoint = (e: React.PointerEvent): ScreenPoint => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };

  const advance = () => {
    setResult(null);
    if (index + 1 >= plan.moments.length) {
      setPhase('fulltime');
      return;
    }
    setIndex((i) => i + 1);
    setPhase('intro');
  };

  const playAction = (outcome: ActionResult, power: number) => {
    animating.current = true;
    const spec = animationSpecFor(moment.ball, outcome, power);
    const base = buildScene({
      moment,
      appearance: DEFAULT_APPEARANCE,
      kits: KITS,
      rng: createRng(deriveSeed(7, index)),
      aim: null,
    });

    const startedAt = performance.now();
    const tick = (now: number) => {
      const frame = sampleActionAnimation(spec, now - startedAt);
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
        setPhase('outcome');
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (animating.current) return;
    if (phase === 'intro') {
      setPhase('aiming');
      return;
    }
    if (phase === 'outcome') {
      advance();
      return;
    }
    if (phase !== 'aiming') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = localPoint(e);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (phase !== 'aiming' || !dragStart.current || animating.current) return;
    const reading = previewSling(dragStart.current, localPoint(e), cameraFor(), config);
    const kind = classifyAction(moment, { dir: reading.dir, power: reading.power });
    setAim({ dir: reading.dir, power: reading.power, kind });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const start = dragStart.current;
    dragStart.current = null;
    setAim(null);
    if (phase !== 'aiming' || !start || animating.current) return;

    const reading = readSling(start, localPoint(e), cameraFor(), config);
    if (!reading) return;

    const outcome = resolveAction(
      moment,
      { dir: reading.dir, power: reading.power },
      skills,
      pressure,
      createRng(deriveSeed(20260721, matchSeed, index)),
    );

    const rated = ratedShotFor(outcome);
    if (rated) setHistory((h) => [...h, rated]);
    if (outcome.goal) setPlayerGoalMinutes((m) => [...m, moment.minute].sort((a, b) => a - b));
    if (outcome.goal && !outcome.scoredByPlayer) setAssists((a) => a + 1);

    playAction(outcome, reading.power);
  };

  const restart = () => {
    setMatchSeed((s) => s + 1);
    setIndex(0);
    setPhase('intro');
    setHistory([]);
    setPlayerGoalMinutes([]);
    setAssists(0);
    setResult(null);
  };

  const full = finalScore(plan, playerGoalMinutes);
  const verdict =
    full.team > full.opponent ? 'match.won' : full.team === full.opponent ? 'match.drew' : 'match.lost';

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

      <MatchHud
        homeShort={CLUB.short}
        awayShort={OPPONENT.short}
        homeGoals={score.team}
        awayGoals={score.opponent}
        minute={minute}
        energy={energy}
        rating={stats.rating}
      />

      {/* Moment card / outcome / hint. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-24 px-6 text-center">
        {phase === 'intro' && (
          <div className="mx-auto max-w-xs rounded-panel bg-noite-950/70 px-6 py-5 ring-1 ring-white/10 backdrop-blur-md">
            <p className="eyebrow text-relva-300">
              {t('match.momentOf', { n: index + 1, total: plan.moments.length })}
            </p>
            <p className="mt-2.5 text-verdict text-white">
              {t(`match.moment.${moment.type}` as TranslationKey)}
            </p>
            <p className="mt-3 text-xs font-medium text-white/45">{t('match.tapToContinue')}</p>
          </div>
        )}

        {phase === 'aiming' && !aim && (
          <p className="text-sm font-medium text-white/55 drop-shadow">{t('match.pull')}</p>
        )}

        {phase === 'outcome' && result && (
          <>
            <p
              className={`text-verdict drop-shadow-lg ${
                result.goal ? 'text-relva-300' : 'text-white'
              }`}
            >
              {t(outcomeLabel(result))}
            </p>
            <p className="mt-2 text-xs font-medium text-white/45">{t('match.tapToContinue')}</p>
          </>
        )}
      </div>

      {phase === 'fulltime' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-noite-950/88 px-8 text-center backdrop-blur-md">
          <p className="eyebrow text-relva-300">{t('match.fullTime')}</p>
          <div>
            <p className="numeric text-6xl font-black tracking-tighter text-white">
              {full.team}
              <span className="px-2 font-normal text-white/25">–</span>
              {full.opponent}
            </p>
            <p className="mt-2 text-sm font-bold tracking-[0.06em] text-white/60">
              {CLUB.short} <span className="text-white/25">·</span> {OPPONENT.short}
            </p>
          </div>
          <p
            className={`text-lg font-black tracking-tight ${
              verdict === 'match.won'
                ? 'text-relva-300'
                : verdict === 'match.lost'
                  ? 'text-white/50'
                  : 'text-white/75'
            }`}
          >
            {t(verdict)}
          </p>

          <dl className="mt-1 grid w-full max-w-xs grid-cols-4 gap-px overflow-hidden rounded-panel bg-white/10 text-white ring-1 ring-white/10">
            {[
              [t('match.yourRating'), stats.rating.toFixed(1)],
              [t('match.yourGoals'), String(stats.goals)],
              [t('match.assists'), String(assists)],
              [t('match.shots'), String(stats.shots)],
            ].map(([label, value]) => (
              <div key={label} className="bg-noite-950 px-1.5 py-3.5">
                <dt className="eyebrow text-[0.55rem] text-white/40">{label}</dt>
                <dd className="numeric mt-1.5 text-xl font-black">{value}</dd>
              </div>
            ))}
          </dl>

          <button
            type="button"
            onClick={restart}
            className="mt-2 min-h-12 rounded-full bg-relva-500 px-8 text-sm font-bold tracking-tight text-white transition-transform active:scale-95"
          >
            {t('match.playAgain')}
          </button>
        </div>
      )}

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
            <span className="numeric text-white/60">{devotion}</span>
          </label>
        </div>
      )}
    </main>
  );
}
