# Arena A/B offline

Esta arena compara dois executáveis UCI no mesmo computador. Ela existe para
responder a uma pergunta objetiva: **o candidate A pontua mais que o candidate
B sob as mesmas condições?** Não é usada durante a partida oficial.

## O que ela garante

- executa uma partida por vez, evitando que duas engines disputem CPU/RAM;
- alterna as cores a cada jogo;
- usa o mesmo conjunto de openings para os dois candidates;
- usa seed registrada para que a ordem possa ser repetida;
- grava PGN, eventos JSONL, resumo JSON e configuração copiada;
- registra crash, timeout, resultado e tempo consumido por cada lado.

Ela não prova Elo com poucas partidas. Ela serve primeiro para eliminar patches
piores, instáveis ou que travam. A conclusão exige tamanho de amostra adequado.

## Preparação

Crie um ambiente Python apenas para a arena e instale a dependência antes do
torneio. Isso não é necessário nem deve rodar no caminho da partida oficial.

```powershell
py -3 -m venv arena/.venv
arena\.venv\Scripts\python -m pip install -r arena/requirements.txt
```

Compile cada candidate para um caminho diferente. Nunca sobrescreva um binário:

```text
bin/baseline/stockfish.exe
bin/arthur-time-v1/stockfish.exe
bin/vanderlei-book-v1/stockfish.exe
```

## Primeiro confronto

1. Copie `arena/example-config.json` para, por exemplo,
   `arena/configs/arthur-vs-vanderlei.json`.
2. Ajuste os caminhos dos dois binários e as opções UCI.
3. Faça uma inspeção sem iniciar engines:

```powershell
arena\.venv\Scripts\python arena/run_match.py arena/configs/arthur-vs-vanderlei.json --dry-run
```

4. Rode o confronto:

```powershell
arena\.venv\Scripts\python arena/run_match.py arena/configs/arthur-vs-vanderlei.json
```

Os artefatos são escritos no diretório definido por `output_dir`: `games.pgn`,
`events.jsonl`, `summary.json` e a cópia imutável de `config.json`.

## Regras para uma comparação justa

- Mesma CPU, tomada/modo de energia, compilador e NNUE.
- Mesmo `Threads`, `Hash`, Syzygy e `Ponder=false` para ambos.
- Uma partida de cada vez.
- Sem livro em testes de força do motor; use openings PGN impostos aos dois lados.
- Comece com 20–40 jogos para detectar crash ou regressão grosseira. Só alegue
  ganho de força com amostra muito maior e incerteza reportada.
- Rode A vs baseline, B vs baseline e A vs B. Não escolha vencedor por uma
  única série curta.

Para o campeonato, livro próprio pode ser usado somente se for permitido e
deve ser testado separadamente como estratégia de sistema, não confundido com
Elo interno da engine.
