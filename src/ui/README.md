# ui/ — React

Telas, HUD e menus. Camada **descartavel**: pode ser reescrita sem tocar no jogo.

Regra: nenhuma regra de jogo mora aqui. Se um componente esta calculando
quanto XP um treino da, esse calculo pertence a `engine/systems/`.

Mobile-first sempre. Todo layout e verificado em 360 px de largura antes de desktop.

## stores/ — Zustand

`careerStore` guarda a carreira carregada e e o unico lugar que le e escreve o
slot automatico. Ele **orquestra**: quem monta o estado inicial e
`engine/systems/career`, quem valida e `engine/save`, quem move bytes e
`persistence/`. Toda mudanca de estado passa por `save()`, que grava na hora —
o jogo nao tem botao de salvar.

Um save corrompido vira `status: 'error'` e **nao** apaga nada: recuperar uma
carreira e decisao do jogador, nunca efeito colateral de um bug.
