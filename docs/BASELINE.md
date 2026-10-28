# Baseline reproduzível

## Decisão atual

O baseline de código é o commit importado `6867444885be3229fd6f0dd9b85702a1da8e8c3b`.
A árvore do motor dentro dele equivale ao `vondele/Stockfish` `effdc3fd3…`.
Não substitua esse baseline silenciosamente.

## Antes de qualquer alteração no motor

Registre em um arquivo datado sob `results/baseline/`:

```text
Git do projeto:
Git do motor:
CPU / núcleos físicos / threads lógicas:
RAM disponível:
Sistema operacional e versão:
Modo de energia / carregador:
Temperatura ambiente:
Compilador e versão:
Comando de build e ARCH:
Arquivo NNUE e hash SHA-256:
Threads / Hash / SyzygyPath / Ponder:
Bench (comando, nós, tempo, NPS, assinatura):
Temperatura, clock e potência no início/fim:
```

## Matriz mínima de benchmark

Com a mesma revisão, rede e modo de energia, execute:

- `Threads`: 4, 8, 12, 16 (ou os limites reais da máquina);
- `Hash`: 1, 2, 4 e 8 GiB, respeitando a RAM livre;
- build apropriado para a CPU e, separadamente, build universal;
- bench frio, após 30 min, 60 min e 120 min de carga.

NPS serve para diagnosticar desempenho, não é prova de Elo. A decisão de
força vem de jogos A/B com aberturas equilibradas e amostra suficiente.

## Sanidades obrigatórias

1. `uci` → conferir `uciok` e opções esperadas.
2. `isready` → conferir `readyok` após configurar Hash/Threads.
3. `bench` → registrar assinatura e NPS.
4. `Stockfish/tests/perft.sh` ou perft equivalente → detectar erro de regras.
5. Partidas longas A/B → capturar crashes, travamentos e consumo.

## Observação sobre hardware

Os dados em `docs/uci-settings.md` são medições históricas declaradas pelo
repositório; não devem ser tratados como baseline universal. A máquina que
executa este workspace em 28/10/2026 reportou Intel Core i5-13420H, 8 núcleos,
12 threads lógicas e aproximadamente 24 GiB de RAM utilizável — diferente da
máquina-alvo descrita nesse documento. Portanto, ainda falta uma baseline
formal no notebook que efetivamente irá ao campeonato.
