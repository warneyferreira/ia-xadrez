# Meio-jogo — testar capturas e simplificações

Hipótese solicitada: manter peças ativas e tensão pode oferecer chances
práticas contra um adversário que decide pior sob pressão. Isso não autoriza
um bônus geral por acumular peças: uma troca pode eliminar ataque adversário
ou conduzir a um final favorável. A investigação compara alternativas antes
de alterar a política de jogo.

## Preparação feita durante a bateria

`scripts/study_middlegame.py collect` só lê partidas já concluídas. Oito
posições da primeira partida v6 25+0 foram selecionadas: quatro capturas
realmente feitas e quatro lances sem captura. O histórico completo, FEN,
tempo gasto e lances legais disponíveis são preservados. Há distância entre
casos próximos para reduzir repetição da mesma sequência.

A seleção usa uma fase material aproximada (dama 4, torre 2, menores 1),
meios-lances 20–80 e pelo menos dez peças no tabuleiro. Esses são critérios
de amostragem, não regras oficiais de fase ou probabilidades de vitória.
Mais lances legais não equivale a mais opções boas.

[Casos](../positions/middlegame-v6-25plus0-research.json),
[PGN de origem](evidence/2026-11-01-middlegame/source-games.pgn) e
[proveniência](evidence/2026-11-01-middlegame/source.json).
São dados exploratórios do próprio confronto; não são holdout independente.

## Análise preparada para depois dos duelos

```powershell
.\arena\.venv\Scripts\python.exe scripts/study_middlegame.py analyze positions/middlegame-v6-25plus0-research.json --depth 26 --maximum 8 --output results/research/middlegame-v6-depth26-review
```

Uma busca normal encontra a alternativa principal. Outra busca, na mesma
profundidade pedida, restringe o grupo contrário: capturas ou lances sem
captura. São registradas avaliação, profundidade efetiva, nós, duração,
continuação e contagens de peças antes/depois da linha prevista.

Uma captura não é necessariamente uma troca; um lance sem captura não
garante preservação das peças nos lances seguintes. Continuações podem ter
comprimentos diferentes. A comparação de contagens não é uma medida de força.
Os valores são estimativas da busca, não prova de equivalência. Se as buscas
divergem ou não completam a profundidade, o relatório mostra essa limitação.
Mates não são convertidos em uma diferença ordinária de centipeões.

Nenhuma preferência por manter peças é aplicada automaticamente. O motor e
o livro da v6 em teste não mudam. Para jogar, o Stockfish recomenda MultiPV 1;
comparações extras ficam na pesquisa offline ([FAQ oficial](https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html#multipv)).

## Verificação realizada

- Quatro testes passaram: restauração do histórico; amostra equilibrada;
  restrição correta de capturas; divergência e profundidade incompleta;
  lance sem captura seguido por captura na PV.
- O `--dry-run` validou os oito casos sem iniciar um motor.
- Uma tentativa de análise durante a bateria foi recusada pelo lock antes
  de criar diretório de saída ou iniciar Stockfish.
- A análise nativa **ainda não foi executada**. Não há candidato novo,
  Elo medido ou ganho de vitórias decorrente deste estudo.
