# Configuração UCI para o campeonato

Engine: `Stockfish/src/stockfish` — `dev-20260919-17a6c8f1`, arch `x86-64-avxvnni`, build PGO.
Máquina: Intel Core Ultra X7 358H (16 threads lógicas, híbrido P-core/E-core), 15 GB RAM, sem AVX-512, com AVX-VNNI + BMI2.

## Valores recomendados

| Opção | Valor | Motivo |
|---|---|---|
| `Threads` | **16** | Medido; ver tabela abaixo |
| `Hash` | **4096** (jogos longos: **8192**) | Deixa folga de RAM para o SO |
| `Ponder` | **true** se o regulamento permitir | Usa o tempo do oponente; ganho grande e gratuito |
| `MultiPV` | **1** | Valor > 1 enfraquece a busca |
| `Skill Level` | **20** (padrão, não tocar) | Qualquer valor menor joga pior de propósito |
| `UCI_LimitStrength` | **false** (padrão) | Idem |
| `Move Overhead` | **10** local / **100–300** online | Compensa latência; evita perder por tempo |
| `NumaPolicy` | `auto` (padrão) | Máquina de 1 socket; não há o que ajustar |
| `UCI_ShowWDL` | opcional | Só exibe win/draw/loss; não afeta força |

## Medições nesta máquina

Comando: `./stockfish bench 1024 <threads> 16 default depth`

| Threads | nps | Escala |
|---|---|---|
| 1 | 1.097.952 | 1,00× |
| 4 | 3.789.499 | 3,45× |
| 6 | 4.323.140 | 3,94× |
| 8 | 5.479.078 | 4,99× |
| 12 | 5.974.922 | 5,44× |
| **16** | **6.686.693** | **6,09×** |

Conclusão: apesar dos E-cores serem mais lentos, 16 threads ainda supera 12 em ~12%. Use 16.

Comparação de arquitetura de compilação (1 thread, média de 3 benches):

| Build | nps |
|---|---|
| `x86-64-avx2` | ~1.189.000 |
| `x86-64-avxvnni` | ~1.233.000 (**+3%**) |

## Windows nativo vs WSL (medido)

Build Windows: cross-compilado do WSL com `x86_64-w64-mingw32-g++ (GCC) 16-win32`,
`make -j16 profile-build ARCH=x86-64-avxvnni COMP=mingw`. PGO completou as 4 etapas
(o WSL executa o `.exe` nativo via interop, então o profiling roda de verdade).

| Build | 1 thread (3 runs) | 16 threads (2 runs) |
|---|---|---|
| Linux ELF | 1.311k / 1.319k / 1.296k | 8.331k / 8.195k |
| Windows `.exe` | 1.327k / 1.296k / 1.277k | 8.565k / 8.039k |

**Conclusão: paridade.** A diferença fica dentro do ruído de turbo/térmico. Não há ganho
em rodar nativo no Windows — escolha pela conveniência do árbitro/GUI, não por desempenho.

Binário de entrega: `bin/stockfish.exe` (102 MB). Roda sozinho, sem nenhum arquivo ao lado:
a rede NNUE está embutida no executável. Validado em diretório vazio:
`depth 33`, 70,2M nós, 7,02M nps em 10 s.

## Regra do Hash

O hash deve ser grande o bastante para o tempo total de busca, e potência de 2.
Regra prática: **~1 GB por minuto de pensamento contínuo com 16 threads**.

| Controle de tempo | Hash |
|---|---|
| Blitz (3+2, 5+0) | 1024 |
| Rápido (15+10) | 2048–4096 |
| Clássico (60+30 ou mais) | 8192 |

`hashfull` no output indica saturação: se passar de ~900 cedo na partida, aumente.
No teste de 10 s com `Hash 4096`, `hashfull` ficou em 61 (6,1%) — folgado.

## Aplicando as opções

**Via GUI** (Arena, Cute Chess, BanksiaGUI, Nibbler): painel de opções da engine.

**Via linha de comando / UCI puro:**

```
setoption name Threads value 16
setoption name Hash value 4096
setoption name Ponder value true
setoption name Move Overhead value 10
```

**Atenção ao testar por pipe:** enviar `quit` logo após o `go` aborta a busca e devolve um
`bestmove` lixo (`depth 1`, `nodes 0`). Para um teste válido, mantenha o stdin aberto:

```bash
{ printf 'setoption name Threads value 16\nsetoption name Hash value 4096\nposition startpos\ngo movetime 10000\n'; sleep 13; } | ./stockfish | tail -2
```

## Resultado de referência (sanidade)

Posição: Ruy López após `e4 e5 Nf3 Nc6 Bb5`, 10 s, 16 threads, Hash 4096:

```
info depth 33 seldepth 51 score cp -19 nodes 52933500 nps 5293350 hashfull 61
bestmove g8f6 ponder e1g1
```

Se um teste futuro render profundidade muito abaixo de ~30 nessas condições, algo
regrediu (throttling térmico, threads erradas, build sem PGO).

## Opções que NÃO devem ser mexidas

- `Skill Level`, `UCI_LimitStrength`, `UCI_Elo` — servem para enfraquecer a engine.
- `MultiPV` > 1 — desperdiça busca em linhas secundárias.
- `nodestime` — só para testes determinísticos com relógio simulado.
- `EvalFile` — só troque se for testar outra rede NNUE deliberadamente.
- `SyzygyProbeDepth` — deixe em 1 com tablebases em SSD; ver `tablebases.md`.
