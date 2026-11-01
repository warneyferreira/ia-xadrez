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

## Confronto no tempo oficial

Na raiz, execute `scripts/test_strength.ps1`. O padrão é 20 partidas em
25+0: podem consumir até **16 h 40 min** de relógio, além da preparação.
Para um ensaio rápido use `scripts/test_strength.ps1 -Games 20 -BaseSeconds 6 -IncrementSeconds 0.06`.
O script resolve os candidatos do cadastro, fixa recursos iguais e cria uma
pasta nova. Não inicia a interface nem análise de revisão junto da arena.

O resumo inclui pontos 3/1/0, escore convencional, pares completos e intervalo
conservador de 95%. Duas cores formam um par. Repetir a mesma abertura não
aumenta a amostra efetiva: agrupamos por posição inicial antes de calcular
a incerteza. Dez aberturas são uma verificação inicial, não um universo que
represente todos os adversários. O campo `evidenceOfSuperiority` não promove
um candidato automaticamente e não substitui uma decisão prévia de amostra.

PGNs também guardam tempo restante e tempo gasto por jogada. Limites de lances
não viram empates; mate exatamente no limite conta. A espera por motor travado
é limitada pelo relógio restante mais 1 s. Falhas de inicialização têm prazo
separado de 15 s e entram no relatório.

## Empate reclamável e repetição efetiva

Novas séries usam `draw_policy: "played"`. O motor escolhe o próximo lance;
a arena reclama empate quando a posição já ocorreu três vezes ou o contador
de 50 lances chegou a 100 meios-lances. Resultados automáticos têm prioridade.
Esta convenção é consistente com o duelo visual; não substitui o árbitro físico.

As séries anteriores a essa correção usavam `claimable`: a arena reclamava
assim que existia uma jogada futura que permitiria reclamar empate, mesmo
que o motor pudesse preferir outra. Essa opção continua disponível apenas
para reprodução. A política aparece no PGN, eventos, configuração e resumo.
Não misture resultados das duas políticas para inferir ganho de força.

`scripts/audit_repetitions.py` preserva o PGN de origem, identifica esses
casos e pesquisa alternativas com histórico completo. Avaliação limitada
próxima de zero não prova vitória perdida nem igualdade exata.
