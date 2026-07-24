import { findClub, findLeague } from '@/content';
import type { GameState } from '@/engine/domain/state';
import { AthletePortrait } from '@/ui/components/AthletePortrait';
import { formatMoney, t } from '@/ui/i18n';
import type { TranslationKey } from '@/ui/i18n';
import { useCareerStore } from '@/ui/stores/careerStore';

/**
 * Where a loaded career lands.
 *
 * Deliberately thin: this is the proof that creation, the save and the boot
 * path are wired end to end, not the career hub. Fixtures, table and the week
 * loop arrive with the season (M4.3/M4.4) — building them here first would
 * mean building them twice.
 */

interface FactProps {
  readonly label: string;
  readonly value: string;
}

function Fact({ label, value }: FactProps) {
  return (
    <div className="bg-noite-950 px-3 py-3.5">
      <dt className="eyebrow text-[0.55rem] text-white/40">{label}</dt>
      <dd className="numeric mt-1.5 text-base font-black text-white">{value}</dd>
    </div>
  );
}

export function CareerHome({ state }: { state: GameState }) {
  const discard = useCareerStore((store) => store.discard);

  const league = findLeague(state.contract.leagueId);
  const club = league ? findClub(league, state.contract.clubId) : undefined;

  const kit = club
    ? { primary: club.colours.primary, secondary: club.colours.secondary }
    : { primary: '#1b2438', secondary: '#7ddba4' };

  const confirmDiscard = () => {
    if (window.confirm(t('career.discardConfirm'))) void discard();
  };

  return (
    <main className="h-full overflow-y-auto bg-noite-900">
      <div className="mx-auto flex max-w-md flex-col items-center gap-5 px-5 py-8">
        <div className="text-center">
          <p className="eyebrow text-relva-300">
            {t('career.season', { season: state.clock.season, week: state.clock.week })}
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tighter text-white">
            {t('career.greeting', { name: state.player.name })}
          </h1>
          <p className="mt-1.5 text-sm text-white/55">
            {t('career.at', {
              position: t(`position.${state.player.position}` as TranslationKey),
              club: club?.name ?? state.contract.clubId,
            })}
          </p>
        </div>

        <AthletePortrait appearance={state.player.appearance} kit={kit} size={220} />

        <dl className="grid w-full grid-cols-2 gap-px overflow-hidden rounded-panel bg-white/10 ring-1 ring-white/10">
          <Fact label={t('career.wage')} value={formatMoney(state.contract.weeklyWage)} />
          <Fact label={t('career.balance')} value={formatMoney(state.finances.balance)} />
        </dl>

        <p className="text-xs text-white/35">
          {t('career.contractUntil', { season: state.contract.untilSeason })}
        </p>

        <div className="flex w-full flex-col gap-2.5">
          <a
            href="#partida"
            className="flex min-h-13 items-center justify-center rounded-full bg-relva-500 px-8 text-sm font-bold tracking-tight text-white transition-transform active:scale-95"
          >
            {t('career.playMatch')}
          </a>
          <button
            type="button"
            onClick={confirmDiscard}
            className="min-h-11 rounded-full text-xs font-semibold text-white/35 transition-transform active:scale-95"
          >
            {t('career.discard')}
          </button>
        </div>
      </div>
    </main>
  );
}
