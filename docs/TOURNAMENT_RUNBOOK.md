# Operação de torneio — procedimento curto

O modo de torneio fica em `http://127.0.0.1:<porta>/tournament`. Ele é um
assistente operacional offline; o relógio físico oficial e o árbitro prevalecem
sempre.

## Antes da rodada

1. Iniciar a engine e abrir a tela de torneio.
2. Conferir nome da engine, cor, Threads, Hash, NNUE e Syzygy.
3. Preparar uma partida de teste, digitar um lance legal e conferir que a
   jogada retornada é legal no tabuleiro.
4. Conferir se o arquivo de log foi criado e se o relógio exibido começa em
   25:00 para ambos.
5. Fechar a partida de teste e preparar a partida oficial.

## Durante a partida

| Momento | Operador de software | Operador do tabuleiro |
| --- | --- | --- |
| Início | prepara a cor e clica **Iniciar** junto do relógio físico | inicia o relógio oficial |
| Adversário joga | digita o lance UCI; a tela valida e calcula | confere a posição física |
| Engine responde | lê origem/destino/promoção em voz alta | faz o lance, aperta o relógio e só então confirma na tela |
| Erro ou divergência | não envia novo lance; registra o estado | para e chama o conferente/árbitro conforme a regra |

Não use “desfazer” improvisado em uma partida oficial. Um estado incorreto deve
ser conferido contra o tabuleiro físico, histórico e orientação da organização.

## Após a rodada

Guardar o PGN/histórico, o log JSONL e anotar qualquer divergência, travamento,
tempo apertado ou procedimento confuso. Essas evidências orientam o ensaio da
rodada seguinte.
