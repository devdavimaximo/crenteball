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

  'match.kickoff': 'Começa o jogo',
  'match.momentOf': 'Lance {n} de {total}',
  'match.tapToContinue': 'Toque para continuar',
  'match.teammateGoal': 'Gol do {club}!',
  'match.opponentGoal': 'O {club} empata o jogo',
  'match.opponentGoalGeneric': 'Gol do {club}',
  'match.fullTime': 'Fim de jogo',
  'match.yourRating': 'Sua nota',
  'match.yourGoals': 'Seus gols',
  'match.shots': 'Finalizações',
  'match.playAgain': 'Jogar outra partida',
  'match.won': 'Vitória',
  'match.drew': 'Empate',
  'match.lost': 'Derrota',

  'match.moment.shot': 'Chance de finalizar',
  'match.moment.header': 'Cabeceio na área',
  'match.moment.through-ball': 'Passe decisivo',
  'match.moment.dribble': 'Drible pra cima',
  'match.moment.free-kick': 'Falta perigosa',
  'match.moment.penalty': 'Pênalti!',
  'match.moment.tackle': 'Desarme decisivo',
  'match.moment.save': 'Defesa!',

  'match.devotionLab': 'Intimidade com Deus (teste)',

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
