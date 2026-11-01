# Scripts reproduzíveis

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
