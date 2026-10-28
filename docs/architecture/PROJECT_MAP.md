# Mapa técnico do projeto

## Visão geral

```text
Operador de treino
       │ navegador local
       ▼
ui/web/app.ts ──HTTP JSON──► ui/src/server.ts ──UCI──► Stockfish/src/stockfish
  regras e tabuleiro             processo Bun               motor C++/NNUE
```

Não há comunicação externa durante o jogo: o servidor escuta apenas em
`127.0.0.1`. A interface é uma ferramenta de treino local, não um controller
de torneio completo.

## Pastas atuais

| Caminho | Conteúdo | O que importa |
| --- | --- | --- |
| `Stockfish/src/` | motor C++ | busca, avaliação NNUE, UCI, tempo e build |
| `Stockfish/src/Makefile` | build do motor | `ARCH`, PGO e targets de compilação |
| `Stockfish/src/search.cpp` | busca seletiva | zona de alto risco; mudanças exigem arena extensa |
| `Stockfish/src/timeman.cpp` | gestão de tempo | principal candidato futuro para teste específico em 25+0 |
| `Stockfish/src/uci.cpp` | protocolo UCI | recebe posição/comandos e emite `bestmove` |
| `Stockfish/src/engine.cpp` | opções e ciclo da engine | `Threads`, `Hash`, `EvalFile`, Syzygy e callbacks |
| `Stockfish/src/nnue/` | avaliação neural | throughput e compatibilidade da rede são críticos |
| `ui/src/engine.ts` | adaptador UCI | inicia a engine, serializa comandos e interrompe busca antiga |
| `ui/src/server.ts` | servidor Bun local | valida payloads, define threads/hash e expõe `/api/*` |
| `ui/web/app.ts` | cliente do tabuleiro | regras com chess.js, UX, promoção, desfazer e tela |
| `docs/` | guias existentes e novos | fonte de verdade operacional do projeto |

## Fluxo da interface atual

1. O navegador cria e valida a posição com `chess.js`.
2. Após o lance humano, envia a lista de lances UCI e `movetime` para
   `POST /api/move`.
3. `server.ts` valida o formato e delega a busca a `engine.ts`.
4. `engine.ts` envia `position startpos moves ...` e `go movetime ...` à engine.
5. O Stockfish responde `info` e finalmente `bestmove`; a UI aplica o lance.

Essa arquitetura já evita injeção de comandos UCI pelo navegador e serializa
buscas concorrentes. Ela ainda não possui relógio oficial, persistência de
partida, watchdog externo, log auditável ou reconciliação com tabuleiro físico.

## Configuração versus força

`Threads`, `Hash`, arquitetura de compilação, NNUE, Syzygy e livro mudam o
comportamento/desempenho sem alterar necessariamente o código da busca. Eles
devem ser tratados como configurações versionadas e medidos no hardware real.
Modificar `search.cpp`, `timeman.cpp` ou `nnue/` é outra categoria: é pesquisa
de engine e só entra após passar pelo protocolo de experimento.
