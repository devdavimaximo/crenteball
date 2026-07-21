# engine/ — o jogo de verdade

TypeScript puro. **Zero dependencias de runtime** — nada de React, nada de DOM,
nada de `Math.random()`. O ESLint bloqueia essas importacoes (ver `eslint.config.js`).

Essa pureza nao e purismo: e o que permite rodar `npm run sim:seasons` e simular
dezenas de temporadas em segundos para balancear o jogo, e o que faz cada regra
ser testavel em milissegundos.

Codigo e comentarios aqui sao em ingles. Texto visivel ao jogador nunca aparece
nesta camada — ele vive em `src/ui/i18n/`, em pt-br.

| Pasta      | Papel                                                        |
| ---------- | ------------------------------------------------------------ |
| `domain/`  | Tipos e invariantes: `Player`, `Club`, `Season`, `GameState`   |
| `systems/` | Regras: treino, evolucao, partida, fe, mercado                 |
| `sim/`     | Simulacao do mundo: calendario, tabela, clubes do computador   |
| `balance/` | Curvas e constantes de tuning — nada de numero magico na logica |
| `rng/`     | Aleatoriedade deterministica semeada pelo save                 |
| `save/`    | Schema do estado, `schemaVersion` e migrations                 |

## Regra do estado

Todo avanco do jogo e uma funcao pura:

```ts
applyCommand(state, cmd, rng) -> { state, events }
```

`GameState` e serializavel — e o save, direto. `events` alimentam a UI
(animacoes, narracao) sem que o motor saiba que a UI existe.
