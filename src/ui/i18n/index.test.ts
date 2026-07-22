import { describe, expect, it } from 'vitest';

import { interpolate, t } from './index';
import { ptBR } from './pt-BR';

describe('t', () => {
  it('resolves a known key', () => {
    // Checked against the dictionary, not a hardcoded string: this test is
    // about lookup working, and copy changes should never break it.
    expect(t('boot.milestone')).toBe(ptBR['boot.milestone']);
    expect(t('boot.milestone')).not.toBe('');
  });
});

describe('interpolate', () => {
  it('replaces named params', () => {
    expect(interpolate('Contrato com {club} por {years} anos', { club: 'Vila Nova', years: 3 })).toBe(
      'Contrato com Vila Nova por 3 anos',
    );
  });

  it('leaves unknown placeholders visible instead of blanking them', () => {
    expect(interpolate('Contrato com {club}', {})).toBe('Contrato com {club}');
  });

  it('replaces every occurrence of the same placeholder', () => {
    expect(interpolate('{name} passa para {name}', { name: 'Davi' })).toBe('Davi passa para Davi');
  });
});

describe('pt-BR dictionary', () => {
  it('never ships an empty string to the player', () => {
    for (const [key, value] of Object.entries(ptBR)) {
      expect(value.trim(), `chave vazia: ${key}`).not.toBe('');
    }
  });
});
