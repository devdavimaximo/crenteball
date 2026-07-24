import { useMemo, useState } from 'react';

import {
  MAX_STARTING_ATTRIBUTE,
  STARTING_ATTRIBUTE,
  STARTING_ATTRIBUTE_POINTS,
} from '@/engine/balance/career';
import {
  BEARD_STYLES,
  HAIR_COLOUR_COUNT,
  HAIR_STYLES,
  MAX_HEIGHT,
  MIN_HEIGHT,
  SKIN_TONE_COUNT,
  randomAppearance,
} from '@/engine/domain/appearance';
import type { Appearance } from '@/engine/domain/appearance';
import { ATTRIBUTE_KEYS, createAttributes } from '@/engine/domain/attributes';
import type { AttributeKey, Attributes } from '@/engine/domain/attributes';
import { POSITIONS } from '@/engine/domain/state';
import type { Position } from '@/engine/domain/state';
import { createRng } from '@/engine/rng';
import { validateStartingAttributes } from '@/engine/systems/career';
import { AthletePortrait } from '@/ui/components/AthletePortrait';
import { t } from '@/ui/i18n';
import type { TranslationKey } from '@/ui/i18n';
import { useCareerStore } from '@/ui/stores/careerStore';

/**
 * Career creation.
 *
 * The one screen the player sees before anything else exists. It collects a
 * name, a position, a face and six numbers, and hands them to the engine —
 * every rule about what is legal (the points on offer, the per-attribute cap)
 * comes from `validateStartingAttributes`, so this file never gets to have an
 * opinion about balance.
 *
 * Which club takes him is deliberately not shown here: it is drawn on
 * `startCareer` and revealed afterwards, so creation is about the player, not
 * about shopping for an employer.
 */

/** Neutral training kit: he has no club yet, and inventing one would lie. */
const TRAINING_KIT = { primary: '#1b2438', secondary: '#7ddba4' };

function cycle(value: number, count: number, step: number): number {
  return (value + step + count) % count;
}

interface CyclerProps {
  readonly label: string;
  readonly value: string;
  readonly onStep: (step: number) => void;
}

/** Label with ‹ value ›. Thumb-sized targets, no dropdown to fight on mobile. */
function Cycler({ label, value, onStep }: CyclerProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-white/55">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`${label} —`}
          onClick={() => onStep(-1)}
          className="flex size-9 items-center justify-center rounded-full bg-white/8 text-white/70 transition-transform active:scale-90"
        >
          ‹
        </button>
        <span className="min-w-26 text-center text-sm font-semibold text-white">{value}</span>
        <button
          type="button"
          aria-label={`${label} +`}
          onClick={() => onStep(1)}
          className="flex size-9 items-center justify-center rounded-full bg-white/8 text-white/70 transition-transform active:scale-90"
        >
          ›
        </button>
      </div>
    </div>
  );
}

interface AttributeRowProps {
  readonly attribute: AttributeKey;
  readonly value: number;
  readonly canRaise: boolean;
  readonly onStep: (step: number) => void;
}

function AttributeRow({ attribute, value, canRaise, onStep }: AttributeRowProps) {
  const filled = ((value - STARTING_ATTRIBUTE) / (MAX_STARTING_ATTRIBUTE - STARTING_ATTRIBUTE)) * 100;

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-white/70">
            {t(`attr.${attribute}` as TranslationKey)}
          </span>
          <span className="numeric text-sm font-black text-white">{value}</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-relva-500" style={{ width: `${String(filled)}%` }} />
        </div>
      </div>

      <button
        type="button"
        aria-label={`${t(`attr.${attribute}` as TranslationKey)} —`}
        disabled={value <= STARTING_ATTRIBUTE}
        onClick={() => onStep(-1)}
        className="flex size-9 items-center justify-center rounded-full bg-white/8 text-lg text-white/70 transition-transform active:scale-90 disabled:opacity-25"
      >
        −
      </button>
      <button
        type="button"
        aria-label={`${t(`attr.${attribute}` as TranslationKey)} +`}
        disabled={!canRaise || value >= MAX_STARTING_ATTRIBUTE}
        onClick={() => onStep(1)}
        className="flex size-9 items-center justify-center rounded-full bg-relva-500/90 text-lg font-bold text-white transition-transform active:scale-90 disabled:bg-white/8 disabled:text-white/25"
      >
        +
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-panel bg-white/4 p-4 ring-1 ring-white/8">
      <h2 className="eyebrow text-relva-300">{title}</h2>
      <div className="mt-3.5 flex flex-col gap-3">{children}</div>
    </section>
  );
}

export function CreateAthlete() {
  const createCareer = useCareerStore((store) => store.create);

  const [name, setName] = useState('');
  const [position, setPosition] = useState<Position>('FW');
  // Seeded from the mount time: the first face is a suggestion, not a default
  // everyone shares.
  const [appearance, setAppearance] = useState<Appearance>(() =>
    randomAppearance(createRng(Date.now() >>> 0)),
  );
  const [attributes, setAttributes] = useState<Attributes>(() =>
    createAttributes(STARTING_ATTRIBUTE),
  );
  const [submitting, setSubmitting] = useState(false);

  const spent = ATTRIBUTE_KEYS.reduce(
    (sum, key) => sum + attributes[key] - STARTING_ATTRIBUTE,
    0,
  );
  const pointsLeft = STARTING_ATTRIBUTE_POINTS - spent;

  const issues = useMemo(() => validateStartingAttributes(attributes), [attributes]);
  const trimmedName = name.trim();
  const ready = trimmedName.length > 0 && issues.length === 0;

  const blocker: TranslationKey | null =
    trimmedName.length === 0 ? 'create.needName' : issues.length > 0 ? 'create.needPoints' : null;

  const stepAttribute = (key: AttributeKey, step: number) => {
    setAttributes((current) => ({ ...current, [key]: current[key] + step }));
  };

  const patch = (change: Partial<Appearance>) => {
    setAppearance((current) => ({ ...current, ...change }));
  };

  const submit = () => {
    if (!ready || submitting) return;
    setSubmitting(true);
    void createCareer({ name: trimmedName, position, appearance, attributes }, new Date());
  };

  return (
    <main className="h-full overflow-y-auto bg-noite-900 pb-32">
      <div className="mx-auto flex max-w-md flex-col gap-4 px-5 pt-8">
        <header className="text-center">
          <h1 className="text-3xl font-black tracking-tighter text-white">{t('create.title')}</h1>
          <p className="mt-2 text-sm text-white/50">{t('create.subtitle')}</p>
        </header>

        <div className="flex justify-center">
          <AthletePortrait appearance={appearance} kit={TRAINING_KIT} size={200} />
        </div>

        <Section title={t('create.identity')}>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-white/55">{t('create.name')}</span>
            <input
              type="text"
              value={name}
              maxLength={40}
              autoComplete="off"
              placeholder={t('create.namePlaceholder')}
              onChange={(event) => setName(event.target.value)}
              className="min-h-12 rounded-chip bg-noite-950 px-4 text-base font-semibold text-white ring-1 ring-white/10 outline-none placeholder:font-normal placeholder:text-white/25 focus:ring-relva-500"
            />
          </label>

          <div>
            <span className="text-sm font-medium text-white/55">{t('create.position')}</span>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {POSITIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPosition(option)}
                  className={`min-h-12 rounded-chip px-1 text-xs font-bold transition-transform active:scale-95 ${
                    option === position
                      ? 'bg-relva-500 text-white'
                      : 'bg-white/8 text-white/60 ring-1 ring-white/10'
                  }`}
                >
                  {t(`position.${option}` as TranslationKey)}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <Section title={t('create.appearance')}>
          <Cycler
            label={t('create.skinTone')}
            value={`${String(appearance.skinTone + 1)}/${String(SKIN_TONE_COUNT)}`}
            onStep={(step) => patch({ skinTone: cycle(appearance.skinTone, SKIN_TONE_COUNT, step) })}
          />
          <Cycler
            label={t('create.hairStyle')}
            value={t(`hair.${appearance.hairStyle}` as TranslationKey)}
            onStep={(step) =>
              patch({
                hairStyle:
                  HAIR_STYLES[cycle(HAIR_STYLES.indexOf(appearance.hairStyle), HAIR_STYLES.length, step)] ??
                  appearance.hairStyle,
              })
            }
          />
          <Cycler
            label={t('create.hairColour')}
            value={`${String(appearance.hairColour + 1)}/${String(HAIR_COLOUR_COUNT)}`}
            onStep={(step) =>
              patch({ hairColour: cycle(appearance.hairColour, HAIR_COLOUR_COUNT, step) })
            }
          />
          <Cycler
            label={t('create.beard')}
            value={t(`beard.${appearance.beard}` as TranslationKey)}
            onStep={(step) =>
              patch({
                beard:
                  BEARD_STYLES[cycle(BEARD_STYLES.indexOf(appearance.beard), BEARD_STYLES.length, step)] ??
                  appearance.beard,
              })
            }
          />

          <label className="flex items-center gap-3">
            <span className="w-20 text-sm font-medium text-white/55">{t('create.height')}</span>
            <input
              type="range"
              min={MIN_HEIGHT * 100}
              max={MAX_HEIGHT * 100}
              value={Math.round(appearance.height * 100)}
              onChange={(event) => patch({ height: Number(event.target.value) / 100 })}
              className="h-1 flex-1 accent-relva-500"
            />
            <span className="numeric w-14 text-right text-sm font-semibold text-white">
              {appearance.height.toFixed(2)}m
            </span>
          </label>

          <label className="flex items-center gap-3">
            <span className="w-20 text-sm font-medium text-white/55">{t('create.build')}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(appearance.build * 100)}
              onChange={(event) => patch({ build: Number(event.target.value) / 100 })}
              className="h-1 flex-1 accent-relva-500"
            />
            <span className="w-14 text-right text-[0.65rem] text-white/45">
              {appearance.build < 0.5 ? t('create.buildSlight') : t('create.buildPowerful')}
            </span>
          </label>

          <button
            type="button"
            onClick={() => setAppearance(randomAppearance(createRng(Date.now() >>> 0)))}
            className="min-h-11 rounded-full bg-white/8 text-sm font-semibold text-white/80 ring-1 ring-white/10 transition-transform active:scale-95"
          >
            {t('create.randomise')}
          </button>
        </Section>

        <Section title={t('create.attributes')}>
          <p className="-mt-1 text-xs leading-relaxed text-white/40">{t('create.attributesHint')}</p>

          <p
            className={`text-sm font-bold ${pointsLeft > 0 ? 'text-relva-300' : 'text-white/45'}`}
          >
            {pointsLeft > 0
              ? t('create.pointsLeft', { n: pointsLeft })
              : t('create.noPointsLeft')}
          </p>

          {ATTRIBUTE_KEYS.map((key) => (
            <AttributeRow
              key={key}
              attribute={key}
              value={attributes[key]}
              canRaise={pointsLeft > 0}
              onStep={(step) => stepAttribute(key, step)}
            />
          ))}
        </Section>
      </div>

      {/* Fixed footer: the commit button must be reachable by a thumb without
          scrolling back to find it. */}
      <div className="fixed inset-x-0 bottom-0 border-t border-white/8 bg-noite-950/92 px-5 py-4 backdrop-blur-md">
        <div className="mx-auto max-w-md">
          {blocker && (
            <p className="mb-2 text-center text-xs font-medium text-white/40">{t(blocker)}</p>
          )}
          <button
            type="button"
            disabled={!ready || submitting}
            onClick={submit}
            className="flex min-h-13 w-full items-center justify-center rounded-full bg-relva-500 text-sm font-bold tracking-tight text-white transition-transform active:scale-95 disabled:bg-white/8 disabled:text-white/30"
          >
            {t('create.start')}
          </button>
        </div>
      </div>
    </main>
  );
}
