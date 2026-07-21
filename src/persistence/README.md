# persistence/ — saves

IndexedDB via Dexie (não `localStorage`: sem teto de 5 MB, sem travar a UI, e com
suporte natural a múltiplos slots).

Todo save é gravado num envelope versionado:

```ts
{ schemaVersion: number, savedAt: string, state: GameState }
```

Ao carregar, o save passa pela cadeia de migrations até a `SCHEMA_VERSION` atual
(`src/engine/meta.ts`).

**Isso existe desde o primeiro dia de propósito**: o formato do estado vai mudar dezenas de
vezes ao longo de meses, e sem migrations cada mudança apagaria a carreira de alguém. Quebrar
save de jogador é falha grave — toda mudança de `GameState` traz a sua migration na mesma
tarefa.

Exportar/importar o save como arquivo `.crenteball` é o que permite jogar no PC e no celular
sem nenhum servidor — e é exatamente o formato que uma sync na nuvem usaria se um dia existir.
