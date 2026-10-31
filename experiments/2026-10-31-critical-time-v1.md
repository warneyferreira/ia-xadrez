# Critical Time v1 — candidato experimental

**Hipótese:** com 25+0, posições em que o melhor lance permanece instável podem
se beneficiar de um orçamento alvo até 20% maior, sem alterar o teto nativo.
É uma hipótese de distribuição de tempo, não treinamento da NNUE.

**Base:** árvore Stockfish `8bf55890eeb1a9e809dec576ac4ee8adee8fb79d`, mesma
NNUE e receita PGO da v2. Uma única mudança funcional de busca: fator de tempo.

**Arquivos nativos:** `engine.cpp` expõe `Tournament Critical Time`, desligado
por padrão; `search.cpp` aplica o fator; `tournament_time.h` delimita a política.
O copyright e a licença do Stockfish são preservados.

**Critérios:** somente sem incremento, a partir do meio-lance 16, profundidade
10, pelo menos 15 s restantes, mais de um lance legal e instabilidade agregada
de pelo menos 1 por thread. Máximo do fator: 1,20. O teto de tempo do Stockfish
e as reservas do controlador continuam sendo aplicados. Não altera a busca
com tempo fixo/profundidade/nós. Pode piorar o final por gastar tempo cedo.

**Teste de política:** nove verificações em tempo de compilação cobrem opção
desligada, relógio baixo, incremento, abertura, profundidade insuficiente,
lance forçado, estabilidade e limites do fator. Compiladas e executadas com GCC.

**Plano de validação:** build Windows AVX-VNNI + PGO em slot próprio; conferir
SHA e NNUE; comparar assinatura de bench de uma thread com v2; confirmar a
ativação real pelo log UCI; regressões de mate/lance legal/relógio; piloto A/B
com o mesmo binário e opção ligada/desligada. Recursos iguais, cores pareadas,
Ponder/livro/Syzygy desligados para isolar tempo; política de empate `played`.
Um piloto curto verifica funcionamento, não demonstra Elo. Validação em 25+0
e aberturas independentes permanece necessária antes de qualquer promoção.

**Decisão inicial: RETEST.** Arthur v2 continua em `arthur-latest`. O candidato
experimental só será cadastrado após build e regressões aprovados. Nenhum
binário antigo será sobrescrito. Rollback: selecionar Arthur v2.

## Correção de interpretação da arena anterior

Nas oito partidas 25+0, sete finais registrados como repetição tinham apenas
uma *possibilidade* de reclamar repetição mediante o próximo lance. A arena
usava `board.outcome(claim_draw=True)` e reclamava por conta do jogador.
Isso é uma convenção possível, mas diferente de deixar o motor escolher o
lance. Não prova que essas partidas seriam vitórias se continuassem.

Na auditoria de 3 s/MultiPV2, alternativas ficaram essencialmente próximas
de zero; o jogo 7 incluiu um limite superior, não uma avaliação exata. Os
dados originais permanecem preservados. Novas séries usam `played`: a arena
reclama após a terceira ocorrência efetiva ou 100 meios-lances sem captura/
peão. Mate, afogamento, material insuficiente, cinco repetições e regra dos
75 lances mantêm prioridade como resultados automáticos. É uma convenção de
laboratório, não uma substituição das decisões do árbitro no torneio físico.

Referências: [python-chess](https://python-chess.readthedocs.io/en/latest/core.html#chess.Board.can_claim_threefold_repetition),
[FIDE, artigos 9.2–9.6](https://handbook.fide.com/chapter/E012023).
