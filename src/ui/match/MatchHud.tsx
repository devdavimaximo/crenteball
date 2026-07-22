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

/**
 * Way out of the match.
 *
 * In a browser tab the back button covers this; in the installed app there is
 * no browser chrome at all, and without it the player is stuck on the pitch.
 */
function ExitButton() {
  return (
    <a
      href="#"
      aria-label={t('hud.exit')}
      className="pointer-events-auto flex size-10 items-center justify-center rounded-chip bg-noite-950/70 text-lg text-white/70 ring-1 ring-white/10 backdrop-blur-md"
    >
      ←
    </a>
  );
}

const BAND_CLASS = {
  standout: 'bg-relva-500 text-white',
  solid: 'bg-noite-950/70 text-white backdrop-blur-md',
  poor: 'bg-amber-600/85 text-white',
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
        <ExitButton />

        {/* Scoreline: the club codes sit quiet, the numbers carry the weight. */}
        <div className="flex items-center gap-2.5 rounded-chip bg-noite-950/70 px-3 py-2 ring-1 ring-white/10 backdrop-blur-md">
          <span className="text-xs font-bold tracking-[0.08em] text-white/70">{homeShort}</span>
          <span className="numeric text-scoreline">
            {homeGoals}
            <span className="px-1 font-normal text-white/25">–</span>
            {awayGoals}
          </span>
          <span className="text-xs font-bold tracking-[0.08em] text-white/70">{awayShort}</span>
        </div>

        {/* Clock */}
        <div className="numeric rounded-chip bg-noite-950/70 px-2.5 py-2 text-sm font-bold ring-1 ring-white/10 backdrop-blur-md">
          {minute}
          <span className="font-normal text-white/40">′</span>
        </div>

        <div className="flex-1" />

        {/* Live rating */}
        <div
          className={`numeric rounded-chip px-3 py-2 text-base font-black ring-1 ring-white/10 ${BAND_CLASS[ratingBand(rating)]}`}
          aria-label={t('hud.rating')}
        >
          {rating.toFixed(1)}
        </div>
      </div>

      {/* Energy */}
      <div className="flex items-center gap-2.5">
        <span className="eyebrow text-white/40">{t('hud.energy')}</span>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/12">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${energyClass(energy)}`}
            style={{ width: `${String(Math.max(0, Math.min(100, energy)))}%` }}
          />
        </div>
        <span className="numeric text-[0.7rem] font-semibold text-white/40">
          {Math.round(energy)}
        </span>
      </div>
    </div>
  );
}
