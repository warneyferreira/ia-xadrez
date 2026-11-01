# Critical Time v1 — candidato experimental

**Decisão após o piloto: RETEST; não promover.** A implementação passou nas
regressões, mas quatro jogos 45+0 terminaram empatados. Arthur v2 permanece
como padrão. Não há ganho de Elo demonstrado.

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

## Resultados executados

- Fonte nativa: `b888ad2fd819de53edf87b7da009a75a475b64ed`.
- Árvore Stockfish: `8b0e1f635cb99520db327bc4e5a29ae7b7bf498a`.
- Windows AVX-VNNI + PGO, GCC MinGW 13 POSIX, 26 arquivos de perfil consumidos.
- Executável: `ce1ad1158f64a90d93a5a365124a08d265dde4c4a7342a0c4f2404e36aa8bbcf`.
- NNUE preservada: `c9e480e92425f887df6ab9b05c6180fbd762b07879df9d9845f1aa75440caa73`.
- Bench padrão, profundidade 13, Hash 64 MB, uma thread: v2 e v3 percorreram
  **1.645.615 nós**. É verificação de assinatura nesse conjunto, não ganho de Elo.
- Dez buscas com o motor real: opção desabilitada por padrão; ativação observada
  nos três casos de pesquisa; sem ativação em relógio baixo, incremento, lance
  único e mate. Todos os lances legais, sem estourar o relógio de cada caso.
- A política não melhora todas as decisões: no caso `conversion-38`, controle
  desligado escolheu Kf2 e opção ligada escolheu g3. Essas referências são
  exploratórias; não foram tratadas como gabarito nem como prova de vitória.
  Duração/profundidade das buscas variou; não inferimos throughput desses casos.
- 25 testes Bun com motor real aprovados, incluindo Ponder com a opção ligada
  em posição de meio-jogo e redução do prazo externo após `ponderhit`.
- 13 testes Python da arena aprovados; nove verificações C++ da política.
- Servidor atualizado executado: v2 ainda padrão, v3 selecionável, política
  antiga/nova indicada, último duelo e análise de 160 meios-lances preservados.
  Verificação real de desktop, celular, foco e seleção sem iniciar novo duelo.

### Piloto A/B

Mesmo executável dos dois lados: `Tournament Critical Time` ligado contra
desligado. Duas threads, Hash 256 MB, Move Overhead 20 ms, sem Ponder, livro ou
Syzygy. Quatro jogos **45+0**, duas posições de abertura nas duas cores, seed
20261031. A arena nova usou `draw_policy: played` nos dois lados.

| Perfil | Vitórias | Empates | Derrotas | Crashes / quedas de tempo |
| --- | ---: | ---: | ---: | ---: |
| V3 tempo crítico ON | 0 | 4 | 0 | 0 |
| Mesmo binário OFF | 0 | 4 | 0 | 0 |

Todos os quatro PGNs encerraram com repetição tripla efetivamente ocorrida.
Zero partidas incompletas. Dois grupos de abertura, intervalo conservador
[0%; 100%]: amostra insuficiente para alegar superioridade. Este piloto não é
uma validação 25+0 e não deve ser combinado com as séries antigas de reclamação
antecipada. Uma vitória contra a referência não foi demonstrada nesta rodada.

Dados portáteis e hashes estão em `experiments/evidence/2026-10-31-critical-time-v1/`.
O cadastro permite testar a v3; os aliases `arthur-latest` e `vanderlei-latest`
continuam respectivamente em v2 e base. Só promover após uma comparação
prespecificada em 25+0, com novas posições independentes e incerteza adequada.

## Reprodução

O build é a receita registrada no cadastro, em slot novo e sem sobrescrever
referências. `scripts/verify_time_candidate.py` valida assinatura/funcionamento;
`pilot-recipe.json` no diretório de evidência conserva opções e caminhos
portáteis. Para repetir a arena, escolha um `output_dir` novo nesse JSON.

Na pasta `ui`, `bun test ./src` com `TEST_ENGINE` apontando para o novo binário
e `TEST_CRITICAL_TIME=1` exercita a integração. `node tests/critical-candidate.mjs`
verifica o servidor real sem iniciar duelos. O teste visual pressupõe as
baterias locais de referência e o duelo preservado; não cria dados fictícios.
