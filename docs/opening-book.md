# Livro de aberturas (permitido no campeonato)

## Fato fundamental

**O Stockfish não tem suporte a livro.** Confira a saída de `uci` do build atual: não existe
`Book File`, `OwnBook` nem equivalente. O suporte foi removido do projeto oficial há anos.

Consequência: o livro **não é configurado na engine**. Ele é fornecido por quem executa a
partida. Existem três caminhos, em ordem de preferência.

## Caminho 1 — Livro pela GUI (recomendado)

A GUI joga os lances do livro e só passa a posição para a engine quando o livro acaba.

| GUI | Formato de livro | Onde |
|---|---|---|
| **Arena** | Polyglot `.bin`, ABK, Arena `.abk` | Engines → Manage → Books |
| **BanksiaGUI** | Polyglot `.bin`, PGN, EPD | Configuração da engine/torneio |
| **Cute Chess (GUI)** | Polyglot `.bin` | Tools → Settings → Engines |
| **Nibbler** | não tem livro | Só análise |

Esse é o caminho a usar se o árbitro do campeonato roda uma GUI.

## Caminho 2 — Cute Chess CLI (torneio automatizado)

Se você é quem roda as partidas, `cutechess-cli` aceita livro Polyglot por engine:

```bash
cutechess-cli \
  -engine cmd=./stockfish name=SF proto=uci \
     option.Threads=16 option.Hash=4096 \
     book=cerebellum.bin bookdepth=12 \
  -engine cmd=./oponente name=OP proto=uci \
  -each tc=60+0.6 \
  -games 100 -concurrency 1 -pgnout partidas.pgn
```

Alternativa: `-openings file=aberturas.pgn format=pgn order=random plies=16`, que impõe a
mesma abertura aos dois lados — é o padrão em testes de força, mas em **campeonato** você
quer o livro só do seu lado, via `book=`.

## Caminho 3 — Adaptador Polyglot (quando o árbitro só aceita "uma engine")

Se o regulamento exige que você entregue **um único executável UCI** e a GUI do árbitro não
gerencia livro, use um wrapper que fala UCI, responde do livro enquanto houver lance, e
encaminha o resto ao Stockfish. É ~150 linhas de Python ou um `polyglot`/`uci-book-adapter`
pronto. Peça que eu escreva quando chegarmos nessa etapa.

## Qual livro usar

| Livro | Tamanho | Perfil |
|---|---|---|
| **Cerebellum3Merge / Brainfish** | ~200 MB–3 GB | Gerado por análise profunda do Stockfish. Melhor escolha para engine-vs-engine |
| **Perfect 2023 / 2021** | ~30–200 MB | Curado, linhas sólidas e testadas, muito usado em torneios de engines |
| **Human.bin** | ~30 MB | Estatístico de partidas humanas. Bom contra humanos, fraco contra engine |
| **Titans / Goi / Elo-book** | variado | Alternativas de comunidade, qualidade irregular |
| **Seu próprio** | — | Gerado com o seu Stockfish; ver abaixo |

Para campeonato de engines a ordem prática é: **Cerebellum > Perfect > Human**.

## Parâmetros do livro que importam

| Parâmetro | Recomendado | Motivo |
|---|---|---|
| Profundidade (`bookdepth`/plies) | **10–16 lances** | Fundo demais entrega a partida a um livro possivelmente desatualizado |
| Variedade / `BookRandom` | **ligado, baixo** | Evita repetir a mesma partida e ser preparado pelo adversário |
| Só melhor lance | não | Previsível; o oponente prepara contra você |
| Cor | usar nas duas | Economiza relógio tanto de brancas quanto de pretas |

## Por que o livro dá pontos

1. **Relógio.** 12 lances instantâneos = tempo inteiro transferido para o meio-jogo.
   No seu hardware, isso é profundidade extra justamente onde a partida é decidida.
2. **Evita linhas mornas.** O Stockfish em busca curta pode entrar em estruturas estéreis
   que empatam contra outra engine forte. O livro escolhe aberturas com jogo.
3. **Custo zero de risco** se a profundidade for moderada e o livro for derivado de análise
   de engine moderna.

## Verificação antes do campeonato

- [ ] Confirmar no regulamento: livro permitido, e **quem** o carrega (você ou o árbitro)
- [ ] Baixar o `.bin` Polyglot escolhido
- [ ] Rodar 2 partidas de teste e conferir no PGN que os primeiros lances saíram do livro
      (saem instantâneos, sem `info depth` da engine)
- [ ] Conferir que, ao sair do livro, a engine recebe a posição correta e pensa normalmente

## Armadilha comum

Livro em formato errado (`.abk`, `.ctg`, `.obk`) não é lido por GUIs que só falam Polyglot.
Garanta extensão **`.bin` Polyglot**. Conversores existem, mas nem todo `.ctg` (formato
ChessBase) converte de forma confiável.
