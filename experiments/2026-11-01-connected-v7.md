# Experimento v7: preparação conectada

## Hipótese e variável

O v6 empatou quatro partidas 25+0 e usou preparação em apenas 1,58% dos
seus lances. Expandir os caminhos efetivamente escolhidos pode economizar
relógio e oferecer mais oportunidades contra a referência. O motor e a rede
permanecem v5/SFNNv19; somente o conhecimento offline muda. Não é treinamento
de pesos e não há promessa de aumento de vitórias.

## Correção do gerador

Ao estender um livro, o gerador marcava as entradas herdadas como já vistas
e descartava seus nós sem expandir as continuações. Isso deixava um caminho
como 1.d4 Cf6 sem preparação para a próxima jogada, apesar de ambos os lances
estarem previstos. Agora os nós herdados servem para alcançar novas posições.

Prioriza históricos compatíveis com nossas escolhas anteriores, considerando
a cor correta. As escolhas do adversário não precisam corresponder ao nosso
livro para a outra cor. Expande até três respostas adversárias de uma busca
MultiPV coerente, além da previsão já guardada. Fora do histórico preparado,
o motor continua calculando normalmente.

A publicação também passa a exigir a profundidade pedida em **ambas** as
confirmações. Antes o teste aceitava profundidade 18 mesmo quando a receita
pedia 26. Nenhuma entrada v6 foi alterada: todas já tinham profundidade 26.

## Receita fixada antes do resultado

- 24 novas posições examinadas, preservando as dez entradas v6 verificadas.
- Professor v5; oponente baseline; ambos 2 threads, Hash 256 MB.
- Propostas MultiPV3 de 3 s; adversário responde em 5 e 15 s; avaliação
  posterior de 2 s. São aproximações offline, não simulação exata de 25+0.
- Confirmações normal e restrita em profundidade 26; diferença máxima 5 cp.
- Expansão MultiPV3 em 3 s; sementes de meios-lances 2–12 dos quatro jogos
  v6 concluídos. Esses dados são de desenvolvimento, não holdout independente.
- Saída separada: `results/research/preparation-v7-connected`.

## Gates e validação

Somente publicar após conclusão, conferência de SHA, legalidade e qualidade
de todas as entradas. Preservar v6 e aliases; v7 é experimental.

Piloto: oito jogos 30+0, v7 contra v6, mesmo motor/controlador/recursos,
posição inicial normal, quatro pares com cores trocadas. Medir W/D/L, falhas,
uso do livro e tempo por jogada. Abertura repetida não equivale a quatro
amostras independentes. O piloto é uma triagem operacional, não estima Elo.

Se passar a triagem sem falhas, preparar comparação 25+0. Ganho de cobertura
é uma melhoria funcional; força só pode ser avaliada pelos confrontos, com
incerteza explícita. Rollback: selecionar v6 ou desativar o repertório.

## Execução automática local

`scripts/validate_prepared_candidate.py` aguarda o livro final, exige todas
as 24 observações, confere origem/SHA, preservação integral do livro v6 e
duas confirmações sem limites para cada resposta nova. Não publica execução
incompleta, outro motor, resposta congelada modificada ou profundidade menor.
Não substitui um ID existente nem altera aliases.

Em seguida cadastra `arthur-v7-connected`, executa o piloto fixado acima e
gera `pilot-report.json`. `pipeline.json` e a Arena mostram conclusão ou
falha. A fila usa o lock já existente; não disputa CPU com outra arena.
O prazo de espera é de duas horas; caso a preparação exceda esse prazo,
o validador registra falha sem encerrar o preparador. O notebook precisa
permanecer ligado; a execução local não consome tokens GPT.

```powershell
.\arena\.venv\Scripts\python.exe -X utf8 -u scripts/validate_prepared_candidate.py results/research/preparation-v7-connected --id arthur-v7-connected --name "Arthur v7 · preparação conectada (experimental)" --planned 24
```

Os resultados de força permanecem pendentes até as partidas serem concluídas.
Não interpretar cadastro automático de experimento como promoção à release.

## Publicação e piloto concluídos em 03/11

24 posições examinadas: 19 novas respostas aceitas e cinco rejeitadas.
O livro final contém **29 entradas**, preservando integralmente as dez v6.
Todas as novas entradas têm profundidade 26 nas duas confirmações e diferença
estimada máxima de 5 cp. SHA:
`899fefd0668b66203a3e217cefe69b1db18d3b9030318b18953a7f7de492f63d`.
O mesmo SHA foi conferido no objeto Git e na conversão de checkout Windows.

**Piloto: 0 vitórias, 8 empates e 0 derrotas**, sem falhas ou jogos incompletos.
V7 usou 20 respostas preparadas em 481 lances (4,16%); v6 usou oito em 479
(1,67%). Isso comprova maior cobertura nesse piloto, **não maior força**.
Oito partidas da mesma posição inicial não sustentam estimativa de Elo.

Passaram os 36 testes Python e três testes do catálogo Bun. O servidor local
foi iniciado explicitamente com v7; a API confirmou perfil e livro ativo.
Os aliases e candidatos anteriores foram preservados.

[Manifesto](evidence/2026-11-03-connected-v7/evidence.json),
[observações da preparação](evidence/2026-11-03-connected-v7/observations.json),
[relatório do piloto](evidence/2026-11-03-connected-v7/pilot-report.json) e
[PGN](evidence/2026-11-03-connected-v7/pilot-games.pgn).

## Próxima comparação: 25+0 da posição inicial

Dois jogos v7 contra baseline, um de cada cor, da posição inicial normal.
Ambos 2 threads, Hash 256 MB, sem Ponder ou Syzygy, política `played`.
Apenas v7 tem o repertório. Objetivo: observar o sistema no ritmo de torneio
sem impor uma abertura que pule suas respostas iniciais. É um único par,
portanto triagem operacional, ainda insuficiente para provar superioridade.
Limite de relógio total: 100 minutos, mais inicialização/gravação.

[Receita congelada](evidence/2026-11-03-connected-v7/competition-request.json).
Relatórios serão mantidos em `results/arena/arthur-v7-vs-base-25plus0-20261103`.
