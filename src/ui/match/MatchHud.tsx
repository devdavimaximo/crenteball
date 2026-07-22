import { ratingBand } from '@/engine/systems/rating';
import { t } from '@/ui/i18n';

/**
 * The match HUD.
 *
 * Overlays the canvas, so everything here is `pointer-events-none` except
 * nothing — the pitch must stay swipeable edge to edge. Laid out for a thumb
 * on a 360px screen first: information hugs the top and the safe-area edges,
 * leaving the middle of the screen clear for the gesture.
 *
 * Presentation only. It computes nothing — the rating arrives already
 * decided by the engine.
 */

export interface MatchHudProps {
  readonly homeShort: string;
  readonly awayShort: string;
  readonly homeGoals: number;
  readonly awayGoals: number;
  readonly minute: number;
  /** 0..100. */
  readonly energy: number;
  readonly rating: number;
}

const BAND_CLASS = {
  standout: 'bg-relva-500 text-white',
  solid: 'bg-white/15 text-white',
  poor: 'bg-amber-600/80 text-white',
} as const;

function energyClass(energy: number): string {
  if (energy > 50) return 'bg-relva-500';
  if (energy > 25) return 'bg-amber-500';
  return 'bg-red-500';
}

export function MatchHud({
  homeShort,
  awayShort,
  homeGoals,
  awayGoals,
  minute,
  energy,
  rating,
}: MatchHudProps) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 px-3 pt-3 text-white"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      <div className="flex items-center gap-2">
        {/* Scoreline */}
        <div className="flex items-center gap-2 rounded-xl bg-noite-900/75 px-3 py-1.5 backdrop-blur-sm">
          <span className="text-sm font-semibold tracking-wide">{homeShort}</span>
          <span className="text-lg font-black tabular-nums">
            {homeGoals}
            <span className="px-1 text-white/40">×</span>
            {awayGoals}
          </span>
          <span className="text-sm font-semibold tracking-wide">{awayShort}</span>
        </div>

        {/* Clock */}
        <div className="rounded-xl bg-noite-900/75 px-2.5 py-1.5 text-sm font-semibold tabular-nums backdrop-blur-sm">
          {minute}
          <span className="text-white/50">′</span>
        </div>

        <div className="flex-1" />

        {/* Live rating */}
        <div
          className={`rounded-xl px-2.5 py-1.5 text-sm font-black tabular-nums ${BAND_CLASS[ratingBand(rating)]}`}
          aria-label={t('hud.rating')}
        >
          {rating.toFixed(1)}
        </div>
      </div>

      {/* Energy */}
      <div className="flex items-center gap-2">
        <span className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-white/50">
          {t('hud.energy')}
        </span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${energyClass(energy)}`}
            style={{ width: `${String(Math.max(0, Math.min(100, energy)))}%` }}
          />
        </div>
      </div>
    </div>
  );
}
