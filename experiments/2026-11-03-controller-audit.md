# Autocrítica e melhoria do controle de torneio

## Onde o esforço ficou desequilibrado

Ampliar repertório melhorou cobertura, mas não demonstrou ganho de força:
v7 versus v6 teve oito empates. Mais versões e mais entradas não são evidência
de melhor xadrez. Os relatos anteriores também não mostram uma grande
vantagem desperdiçada: na bateria v6 25+0, as avaliações próprias registradas
atingiram no máximo +20 cp. Isso não autoriza concluir que o final é o problema.

Há quatro frentes diferentes, que precisam ser medidas separadamente:

1. **Criar vantagem:** preparação e avaliação de decisões de meio-jogo.
   Expansão mais profunda já está enfileirada; não alterar a versão em jogo.
2. **Converter vantagem existente:** faltam testes variados de finais
   comprovadamente ganhos. A suíte atual tem três referências exploratórias,
   um mate em um, uma resposta única e um final de damas empatado. Ela não
   permite afirmar boa conversão em geral. Próximo conjunto deve separar
   posições ganhas, empatadas e defesa difícil, com validação local por regras
   ou tablebases; acertar uma referência de busca não é provar vitória.
3. **Tempo efetivamente disponível:** ensaiar Ponder, latência do operador e
   configuração no hardware real, mantendo as condições da comparação claras.
   Aumentar RAM ou forçar manutenção de peças sem evidência não é solução.
4. **Execução confiável:** tratar decisões exatas e cancelamentos corretamente.
   Esta é a melhoria implementada neste passo.

## Mate em um sem busca geral

O controlador físico já enumerava todos os lances legais com SAN. Essa
informação já identifica mate imediato por `#`. Agora ele usa a confirmação
pelas regras para selecionar o lance, parar qualquer previsão em andamento e
responder sem iniciar outra busca. Inclui pretas, brancas e promoção.

Registra `source=proven-mate`, mate em um, zero nós de busca e contador próprio.
Não inventa profundidade de análise ou avaliação em centipeões. A posição
não muda automaticamente: o operador ainda executa o lance e confirma no
tabuleiro. Xeque simples e afogamento não são classificados como mate.

Isso pode poupar tempo ao encerrar uma posição já ganha, especialmente no
apuro. Não cria uma vitória numa posição empatada e não demonstra aumento de
Elo. É uma contribuição do controlador, não alteração da NNUE ou da busca.

## Cancelamento e respostas atrasadas

Respostas imediatas, busca normal e Ponder confirmado verificam se a sessão
e a posição continuam válidas depois de aguardarem operações assíncronas.
Um resultado atrasado não pode retornar como uma decisão atual. Métricas de
previsões antigas também não são adicionadas depois que a geração mudou.

## Validação e isolamento

Onze testes de controlador/preparação passaram, com motores simulados, sem
iniciar novos Stockfish durante a bateria. Casos cobrem mate de ambas as cores,
promoção, xeque sem mate, posição encerrada, descarte de Ponder, cancelamento
de lance forçado e busca atrasada. TypeScript e build da tela passaram.

O texto foi conferido numa página isolada em desktop e celular, com teclado:
mate confirmado ainda exige confirmação física; não anuncia partida encerrada
antes disso. Nenhum POST foi enviado à sessão real. Evidências visuais locais
em `results/visual/exact-mate/`.

O motor, o livro v7, os scripts usados pelo duelo e as referências congeladas
da fila v8 permanecem intactos. Esta mudança pertence ao modo Torneio físico.

Ativação: reiniciada somente a interface, depois de confirmar torneio físico
ocioso e duelo visual encerrado. A API confirmou `tournament-v2-exact-mate`.
O processo independente da arena permaneceu com o mesmo PID e a fila v8
continuou aguardando. Não houve reinicialização dos participantes da bateria.
