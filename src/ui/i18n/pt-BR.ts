/**
 * Player-facing strings, pt-BR.
 *
 * Every string the player can read lives here — never inline in a component.
 * Keys are namespaced by screen or system (`boot.`, `match.`, `faith.`) so the
 * file stays navigable as the game grows.
 */
export const ptBR = {
  'boot.milestone': 'M0',
  'boot.tagline': 'Fundação técnica no lugar. O núcleo do jogo começa no M1.',

  'hud.energy': 'Energia',
  'hud.rating': 'Nota da partida',

  'shot.hint': 'Deslize da bola em direção ao gol',
  'shot.again': 'Toque para tentar de novo',
  'shot.tally': '{goals} gols em {shots} chutes',
  'shot.outcome.goal': 'GOOOL!',
  'shot.outcome.saved': 'Defendeu!',
  'shot.outcome.post': 'Na trave!',
  'shot.outcome.offTarget': 'Pra fora…',
  'shot.outcome.blocked': 'Travado!',

  'pwa.offlineReady': 'Pronto para jogar sem internet.',
  'pwa.updateReady': 'Nova versão disponível.',
  'pwa.update': 'Atualizar',
  'pwa.dismiss': 'Agora não',
  'pwa.close': 'Fechar aviso',
} as const;
