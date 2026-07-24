import type { Money } from '@/engine/domain/money';

import { ptBR } from './pt-BR';

export type TranslationKey = keyof typeof ptBR;

type Params = Readonly<Record<string, string | number>>;

const dictionary: Readonly<Record<TranslationKey, string>> = ptBR;

/**
 * Resolves a player-facing string.
 *
 * Deliberately hand-rolled instead of pulling an i18n library: the game ships a
 * single locale today, and the only feature actually needed is `{placeholder}`
 * interpolation. Swapping this for a real library later is a one-file change,
 * because callers only ever see `t(key, params)`.
 *
 * Keys are type-checked — a typo is a build error, not a blank label in-game.
 */
export function t(key: TranslationKey, params?: Params): string {
  const template = dictionary[key];
  return params ? interpolate(template, params) : template;
}

/**
 * Replaces `{name}` placeholders. An unknown placeholder is left untouched
 * rather than blanked, so a missing param shows up as `{club}` in the UI
 * instead of silently rendering a gap nobody notices.
 */
const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

/**
 * Money, for reading.
 *
 * The only place cents are ever divided: presentation. The domain keeps whole
 * cents precisely so this conversion happens once, at the last moment, and
 * never accumulates (CLAUDE.md section 4.7). Centavos are dropped — a wage of
 * R$ 1.020,00 reads better than the two zeroes it always ends in.
 */
export function formatMoney(amount: Money): string {
  return currency.format(amount / 100);
}

export function interpolate(template: string, params: Params): string {
  return template.replace(/\{(\w+)\}/g, (match: string, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}
