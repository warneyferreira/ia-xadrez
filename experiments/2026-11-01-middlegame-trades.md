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
- A primeira análise nativa foi executada após a conclusão da bateria,
  nos quatro primeiros casos previamente selecionados; resultados abaixo.

## Resultado da primeira revisão executada

Quatro casos do conjunto previamente fixado foram analisados em profundidade
26, usando v5 nativa, 1 thread e Hash 128 MB. Todas as oito buscas atingiram
a profundidade pedida. Sem alteração do candidato.

| Caso | Melhor busca normal | Melhor alternativa do outro grupo | Interpretação |
|---|---|---|---|
| Antes de 11.exd5 | exd5, +27 cp | O-O-O, -698 cp | Evitar toda captura aqui perde muito; recapturar era necessário. |
| Antes de 14.Rad1 | Kh1, +15 cp | Bxa6, -610 cp | Capturar indiscriminadamente também piora. |
| Antes de 22.axb5 | axb5, +4 cp | Nd4, +7 cp | Buscas limitadas discordam ligeiramente; não demonstra ganho ao conservar peças. |
| Antes de 26.h5 | Rxg4, 0 cp | Kg1, 0 cp | Ambas as linhas analisadas mantêm avaliação de empate. |

Os valores são estimativas do motor nessas buscas, não probabilidades de
vitória. A alternativa sem captura no lance atual pode trocar peças depois.
Conclusão restrita: **rejeitar um bônus cego para conservar peças**. Nenhum
dos quatro casos demonstrou uma vantagem vencedora que o v6 teria deixado
de converter. O conjunto é exploratório, retirado de uma única partida;
não é um teste de força nem uma prova global sobre todas as trocas.

[Resultados completos](evidence/2026-11-01-middlegame/depth26-report.json).
