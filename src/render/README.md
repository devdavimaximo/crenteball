# render/ — Canvas 2D

Desenho do campo nos momentos-chave e composicao do sprite em camadas do atleta
(paper-doll: corpo, uniforme, cabelo, barba, acessorios).

Canvas 2D puro, sem PixiJS: a cena de um lance e estatica (campo, ~6 sprites,
mira, trajetoria) e nao justifica WebGL. Tudo fica atras da interface
`MatchRenderer` para que essa decisao possa ser revista sem tocar no resto.

Nao contem regra de jogo — recebe um resultado ja decidido pelo motor e o anima.
