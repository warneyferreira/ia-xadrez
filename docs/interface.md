# Interface para jogar contra a IA

Programa em `ui/` que abre um tabuleiro no navegador e joga contra o Stockfish deste
repositório. Não precisa de internet nem de instalação: o executável traz a página embutida
e conversa com o motor por UCI.

## Executáveis (`bin/`)

| Sistema | Abrir | Motor ao lado |
|---|---|---|
| Windows | `ia-xadrez.exe` (duplo clique) | `stockfish.exe` |
| Linux / WSL | `./ia-xadrez` | `stockfish` |

O programa abre o navegador padrão sozinho e mostra o endereço no console
(`http://127.0.0.1:<porta>/`). Fechar a janela do console encerra o jogo e o motor.
Para entregar a alguém, copie os **dois** arquivos do sistema dela para a mesma pasta.

O motor é o build *universal* do Stockfish: escolhe as instruções da CPU (AVX2, AVX-VNNI,
AVX-512…) em tempo de execução, então roda em qualquer PC x86-64. Nesta máquina ele
seleciona `x86-64-avxvnni`. Bench de assinatura: `1559611`, igual ao build PGO de
`docs/uci-settings.md`.

Opções de linha de comando:

| Opção | Efeito |
|---|---|
| `--engine <caminho>` | Usa outro executável UCI em vez do `stockfish` ao lado |
| `--port <n>` | Porta fixa (padrão: uma porta livre qualquer) |
| `--no-open` | Não abre o navegador |

## Na tela

- **Jogar de**: brancas, pretas ou aleatório; vale na próxima **Nova partida**.
- **Tempo da IA por lance**: 0,5 s a 10 s (`go movetime`). É o único ajuste de força: a IA
  joga sempre com `Skill Level` 20, com todas as threads da máquina e `Hash` 256 MB.
- **Desfazer lance**: volta o seu último lance e a resposta da IA.
- Lances legais aparecem ao selecionar a peça; promoção abre a escolha de peça.
- Mostra avaliação do ponto de vista das brancas e profundidade da última busca.
- Detecta xeque-mate, afogamento, repetição tripla, material insuficiente e regra dos 50.

## Gerar `bin/`

No WSL/Debian, com `g++`, `make`, `x86_64-w64-mingw32-g++` e `node`/`npm`:

```bash
ui/build.sh      # motor universal (Linux + Windows) + interface — alguns minutos
ui/build.sh ui   # só a interface, se o motor não mudou
```

`bin/` não vai para o git: cada binário passa de 100 MB, acima do limite do GitHub.

## Desenvolvimento

```bash
cd ui
npm ci
npm run dev        # usa ../Stockfish/src/stockfish (compile antes com make)
npm run typecheck
```

| Arquivo | Papel |
|---|---|
| `ui/src/server.ts` | Servidor HTTP local (Bun), rotas `/api/*`, abre o navegador |
| `ui/src/engine.ts` | Processo UCI: fila de comandos, `stop` ao interromper busca |
| `ui/web/app.ts` | Tabuleiro ([chessground](https://github.com/lichess-org/chessground)) e regras ([chess.js](https://github.com/jhlywa/chess.js)) |

O servidor só escuta em `127.0.0.1` e valida cada lance (`^[a-h][1-8][a-h][1-8][qrbn]?$`)
antes de repassar ao motor, então a página não consegue injetar comandos UCI.
