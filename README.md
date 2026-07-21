# Crenteball

Jogo de carreira de futebol para navegador. Você controla **um** atleta, do primeiro contrato ao
legado — e a progressão pessoal gira em torno da intimidade com Deus, não do acúmulo de bens.

Roda offline, instala como app no celular, cabe num link.

## Comandos

| Comando              | O que faz                                |
| -------------------- | ---------------------------------------- |
| `npm run dev`        | Servidor de desenvolvimento              |
| `npm test`           | Testes (Vitest)                          |
| `npm run test:watch` | Testes em watch                          |
| `npm run lint`       | ESLint, incluindo a fronteira de camadas |
| `npm run typecheck`  | TypeScript                               |
| `npm run build`      | Build de produção estático               |

## Estrutura

```
src/
  engine/       o jogo — TS puro, zero deps, testável e simulável
  render/       Canvas 2D: campo e sprite em camadas do atleta
  ui/           React: telas, HUD, menus, i18n
  content/      JSON do mundo (ligas, clubes, nomes) validado por Zod
  persistence/  IndexedDB, saves versionados, export/import
```

A dependência só aponta para dentro: `ui/` e `render/` conhecem `engine/`, mas `engine/` não
conhece ninguém. O ESLint reprova o contrário.

Cada pasta tem um `README.md` explicando seu papel e o porquê das decisões.

## Convenções

- Código e comentários em inglês; texto visível ao jogador em pt-br via `src/ui/i18n`.
- Nenhuma regra de jogo fora de `engine/`.
- Toda aleatoriedade passa pelo RNG semeado — o jogo é determinístico por seed.
- Dinheiro em inteiros (centavos), nunca ponto flutuante.

## Estado

M0 — fundação técnica.

## Sobre o conteúdo

Clubes, ligas, competições e atletas são fictícios. Nenhuma marca, escudo ou nome real é usado.
Projeto pessoal, sem fins comerciais.
