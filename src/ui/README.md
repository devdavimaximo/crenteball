# ui/ — React

Telas, HUD e menus. Camada **descartavel**: pode ser reescrita sem tocar no jogo.

Regra: nenhuma regra de jogo mora aqui. Se um componente esta calculando
quanto XP um treino da, esse calculo pertence a `engine/systems/`.

Mobile-first sempre. Todo layout e verificado em 360 px de largura antes de desktop.
