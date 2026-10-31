# Controller v1 e observação da arena

## Objetivo e limite

Reduzir desperdício de busca e risco de tempo no torneio físico, além de
tornar baterias de testes compreensíveis. Stockfish, NNUE, binários e aliases
de candidatos permanecem congelados. O candidato principal continua Arthur
v2 PGO. Não há ganho de Elo comprovado nesta alteração.

## Controle da IA

- Ponder UCI real, opcional e experimental no torneio físico: `go ponder`,
  conferência do histórico completo, `ponderhit` quando confirmado.
- Previsão errada: interromper, consumir a resposta anterior e pesquisar a
  posição real. Nenhum lance é aplicado antes de receber o lance adversário.
- Um único lance legal: resposta imediata com avaliação desconhecida, sem
  inventar pontuação. Não significa conhecer o melhor lance em posição geral.
- Urgência abaixo de 15 s: teto externo de até 400 ms, respeitando a reserva;
  o gerenciador nativo continua distribuindo o tempo normal.
- Margem física p90 das últimas 12 operações + 500 ms: 1,5–8 s. A opção
  nativa `Move Overhead` é limitada a 5 s, conforme o código deste Stockfish;
  a reserva externa mantém a margem física completa + 250 ms.
- Telemetria de profundidade/nós durante a busca e watchdog para motor travado.

## Arena e preservação

`/arena` lê configurações, resultados e progresso dos testes locais. Novas
baterias publicam posição e relógios por lance. Baterias já carregadas pelo
Python anterior só atualizam o placar ao terminar cada jogo.

O lock do sistema operacional impede duas novas baterias de disputar a CPU.
No Windows, verificar se um processo existe usa a API de consulta de processos,
sem enviar sinais. A interface nova bloqueia novos duelos/análises durante a
bateria. O servidor antigo precisa ser encerrado pelo operador para carregar
essas proteções; editar fontes não atualiza o servidor já aberto.

Duelo pausado é salvo e pode ser retomado após reinício. A retomada verifica
as identidades dos binários; uma alteração exige preservar o PGN e iniciar
outro duelo. Partida incompleta não é convertida em empate.

## Validação

Testes leves: 21 testes Bun aprovados, 3 testes nativos adiados; 8 testes Python
aprovados; checagem TypeScript aprovada. Incluem previsão certa/errada, lance
único, cancelamento antes do início, motor travado e exclusão mútua entre
processos. O teste visual usa a interface compilada e respostas controladas;
não comprova a integração do servidor novo com o Stockfish real.

Reprodução leve: `bun test ./ui/src`, `python -m unittest discover -s arena/tests`;
em `ui`, `bun run typecheck` e `bun run test:arena-ui`. O teste visual requer
o servidor local aberto e histórico de duelo/bateria existente. As chamadas
ao servidor original são somente de leitura; interações usam respostas
controladas em navegador isolado. Capturas ficam em `results/visual`.

Oito jogos 25+0 em `match-20261031-031514-070` estavam em andamento durante
o desenvolvimento. Seus binários e configuração não foram alterados. Há
registro local de sobreposição de desenvolvimento: seus dados não devem ser
apresentados como medição com máquina exclusivamente dedicada.

## Fila posterior, sem GPT

`scripts/research_queue.py` aguarda a bateria dependente e executa:

1. Testes de protocolo com o Stockfish real, incluindo Ponder.
2. Diagnóstico de seis posições em três tempos de busca.
3. Piloto de 12 jogos rápidos, mesmo binário/rede/Hash, 4 vs 2 threads.

Os estágios têm limite de duração e logs próprios. Encerramento por prazo
atinge apenas processos criados pela fila. Não há treinamento da rede,
alteração automática do código ou promoção automática de candidato. Uma fila
preparada em código só está rodando quando `research-queue.json` registra PID
vivo e estágio atual. A fila foi preparada, mas não iniciada nesta sessão.

Ponder com motor real e ganho competitivo permanecem pendentes. Antes de
ativar em competição, valide o fluxo físico e compare em condições adequadas.
