# Scripts reproduzíveis

`study_middlegame.py collect <pasta-da-bateria> --output <casos.json>` extrai
decisões de partidas concluídas, com históricos completos e alternativas
legais de captura/sem captura. `analyze <casos.json> --output <pasta-nova>
--depth 26 --maximum 8` compara esses grupos em pesquisa offline. `--dry-run`
valida os casos sem motor. A análise real exige a arena livre; não aplica
nenhum bônus por manter peças nem altera candidatos automaticamente.

`report_match.py <pasta-da-bateria>` lê os PGNs/eventos e grava um relatório
compacto em `results/analysis`. Não executa motores nem altera os arquivos
da partida. Inclui tempos, avaliações disponíveis, material, respostas
forçadas, cobertura de repertório e posições prioritárias para revisão.
`--wait` aguarda a bateria terminar (até quatro horas) e então gera o arquivo.
Interrupção permanece interrupção; partidas parciais não viram empates.

Para ampliar um repertório com `prepare_opponent.py`, `--extend-repertoire`
preserva entradas verificadas do mesmo executável/rede. Rejeita origem ou
qualidade incompatível. `--seed-min-ply 2 --seed-max-ply 12` inclui lacunas
desde os primeiros lances dos PGNs; a extensão prioriza históricos curtos
e continuações antes de aprofundar outras linhas. Ela continua exigindo o
lock da arena e só pode calcular quando a bateria estiver livre.

Para um núcleo oficial mais recente, `build_candidate.py --repository` aceita
apenas o repositório oficial e exige o SHA completo. A rede é obtida dos
servidores oficiais (com alternativa GitHub/LFS), conferida e embutida durante
o build. A partida não faz downloads. `--resume` retoma apenas um slot externo
incompleto e intacto; não substitui um candidato já publicado. A instalação
automática lê essa origem da receita cadastrada.

Scripts futuros de build, bench, arena e coleta devem registrar argumentos,
ambiente e saída. Não escreva scripts que baixem recursos no caminho de execução
de uma partida de competição.

- `build_candidate.py`: build isolado com PGO nativo Windows e arquitetura
  compatível, manifesto de fontes/NNUE/compilador/SHA e logs de cada etapa.
- `benchmark_engine.py`: aquecimento, ordem AB/BA, dados brutos e mediana de NPS.
- `test_strength.ps1`: resolve candidatos, fixa recursos iguais e gera confronto
  pareado; padrão 20 jogos em 25+0, que pode levar até 16 h 40 min de relógio.
- `validate_book.py`: revisão offline em duas buscas com Hash limpo e mínimo
  de profundidade; nunca ativa automaticamente o resultado experimental.
## Fila posterior de diagnóstico

Na raiz do projeto, com a bateria atual em andamento:

```powershell
.\arena\.venv\Scripts\python.exe scripts/research_queue.py --after results/arena/match-20261031-031514-070
```

Mantenha o terminal e o computador ligados, sem suspensão. A fila aguarda
o resumo da bateria indicada e só então usa o processador. Executa testes
nativos de protocolo/Ponder, seis posições em 0,25/3/10 s e um piloto de
12 jogos rápidos com 4 vs 2 threads (mesmo binário e Hash 256 MB).

O estado fica em `results/arena/research-queue.json`, visível em `/arena`.
Logs e resultados ficam em `results/research/<data-hora>`. `stage: done`
indica conclusão; falhas e interrupções conservam os relatórios já gravados.
As etapas têm prazo e encerram apenas seus próprios processos quando necessário.
Uma segunda fila ou arena simultânea é recusada.

Não há GPT, treinamento da NNUE ou promoção automática. O resultado serve
para escolher a próxima mudança. Um piloto rápido não prova ganho em 25+0.

Para apenas o diagnóstico de posições, com a máquina livre:

```powershell
.\arena\.venv\Scripts\python.exe scripts/research_positions.py --engine bin/arthur-v2/stockfish.exe --output results/research/positions-manual
```

A saída precisa ser nova. Veja `positions/README.md` para distinguir hipóteses
de pesquisa de verificações exatas.

## Auditoria de repetição e candidato de tempo

`audit_repetitions.py` verifica os finais registrados no PGN e analisa os
próximos lances com histórico completo. Use saída nova; o PGN não é modificado:

```powershell
.\arena\.venv\Scripts\python.exe scripts/audit_repetitions.py --pgn experiments/evidence/2026-10-31-critical-time-v1/25m-original.pgn --engine bin/arthur-v2/stockfish.exe --output results/research/repetition-audit-new --seconds 3
```

`verify_time_candidate.py` compara a assinatura de bench de profundidade fixa,
confere a opção desligada por padrão, observa ativação real e verifica lances
legais, mate, lance único, relógio baixo e incremento. Reserva o processador
com o mesmo lock da arena:

```powershell
.\arena\.venv\Scripts\python.exe scripts/verify_time_candidate.py --engine bin/arthur-v3-critical/stockfish.exe --output results/research/critical-validation-new
```

O build da v3 é reproduzido por `setup.ps1` a partir do commit cadastrado.
`jogar.ps1 -Candidate arthur-v3-critical -Port 18767` abre um perfil separado;
o padrão permanece v2. Nenhuma verificação promove o candidato automaticamente.

## Preparação específica offline

`prepare_opponent.py` pesquisa três alternativas, observa respostas do baseline
em dois orçamentos e confirma escolhas com buscas independentes de profundidade
fixa. Usa o lock da arena e exige uma pasta de saída nova:

```powershell
.\arena\.venv\Scripts\python.exe scripts/prepare_opponent.py --output results/research/preparation-new --positions 40 --teacher-seconds 2 --verify-seconds 2 --verify-depth 24
```

O resultado não é ativado automaticamente. Deve ser validado, filtrado e
registrado com SHA próprio antes de substituir um candidato. A v4 publicada
foi filtrada para perda estimada máxima de 10 centipeões, antes das partidas.

`prepared_engine.py` é o controlador UCI desse perfil; executa o Stockfish
local e encaminha a busca quando a linha não está preparada. O lançador usa
o interpretador base e protege o filho por Job Object no Windows. Prefira
`jogar.ps1 -Candidate arthur-v4-prepared`, que monta esses argumentos e hashes.

Para uma extensão compatível, `prepare_opponent.py --extend-repertoire`
preserva entradas verificadas da mesma rede e expande suas continuações.
`--branch-replies 3` inclui alternativas do adversário. O gerador é offline;
o motor da partida não executa essas buscas extras.

`validate_prepared_candidate.py` pode aguardar essa preparação, validar as
observações e cadastrar um **novo** candidato experimental. Executa então
o piloto fixo de oito jogos 30+0 contra a referência, com cores trocadas,
e salva relatório. Não muda aliases, não sobrescreve versões e não promete
melhoria de força. Veja a receita e os critérios em
`experiments/2026-11-01-connected-v7.md`. A Arena mostra o estado da fila;
as buscas e partidas locais não usam GPT.
