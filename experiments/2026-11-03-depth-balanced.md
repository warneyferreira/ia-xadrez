# Próximo experimento: preparação mais profunda

O v7 ampliou o livro de dez para 29 entradas, mas suas 19 respostas novas
ficaram em históricos de 1–5 meios-lances. O piloto usou mais preparação
(20 lances contra oito do v6) e continuou com oito empates. A próxima hipótese
é alcançar continuações mais longas, mantendo a segurança da escolha.

## Mudança isolada no estudo offline

O novo modo `depth-balanced` prioriza caminhos mais longos **somente quando
todas as nossas escolhas anteriores estão preparadas e coincidem**. Uma
posição profunda trazida de PGN, mas desconectada dessas escolhas, não ganha
prioridade só por estar longe da abertura. As jogadas do adversário são livres.

Distribui tentativas entre cinco famílias: nossas brancas e nossas pretas
contra e4, d4, c4 e Nf3. Dentro da família, aprofunda o caminho verificado.
Assim, uma linha não consome todo o orçamento e a expansão rasa não ocupa
todas as posições. O modo anterior continua disponível para comparação.

Nada muda no binário, na rede, no controlador ou no livro v7 que está jogando.
Não há cálculo de xadrez adicional durante os duelos atuais.

## Receita e critérios fixados antes dos resultados

- Aguardar `arthur-v7-vs-base-25plus0-20261103` concluir os dois jogos sem
  falhas, jogos incompletos ou divergências entre PGN e eventos.
- Conferir os hashes congelados de motores, livro, preparador e controlador;
  adiar se alguma referência mudar durante a espera.
- Estudar 40 posições novas, até o histórico de 22 meios-lances. Esse é um
  teto, não promessa de chegar à 12ª jogada em todos os caminhos.
- Preservar integralmente as 29 respostas v7; professor NNUE19 e baseline
  congelados, ambos 2 threads/Hash 256 MB. Propostas 3 s, respostas adversárias
  5/15 s, avaliação posterior 2 s; expansão de até duas respostas em 3 s.
- Duas confirmações de profundidade 26 e diferença estimada máxima de 5 cp.
- Sementes dos jogos anteriores são dados de desenvolvimento, não holdout.
- Publicar `arthur-v8-deep` como **experimental** somente se todas as 40
  observações concluírem e houver novas respostas válidas. Não alterar aliases.
- Oito jogos 30+0 contra v7, recursos iguais e cores alternadas. Medir W/D/L,
  falhas, cobertura e profundidade das sequências alcançadas. Não estimar Elo
  a partir dessa amostra pequena e repetida.

O processo local pode esperar até quatro horas pela bateria e permite até
duas horas à preparação. Ao exceder o prazo de preparação, encerra apenas a
árvore que ele próprio criou e registra falha; não publica um livro parcial.
Estado na Arena e em `results/research/preparation-v8-deep.pipeline.json`.
As pesquisas e partidas usam engines locais, sem GPT. O notebook precisa
continuar ligado e sem suspensão.

```powershell
.\arena\.venv\Scripts\python.exe -X utf8 -u scripts/validate_prepared_candidate.py results/research/preparation-v8-deep --id arthur-v8-deep --name "Arthur v8 · preparação profunda (experimental)" --reference arthur-v7-connected --planned 40 --deepen-after results/arena/arthur-v7-vs-base-25plus0-20261103
```

## Verificação

Testes verificam preferência por cadeia completa, rejeição de prioridade para
sementes desconectadas, equilíbrio entre cores/aberturas, compatibilidade do
modo anterior e recusa de dependência incompleta, com falha ou inconsistente.
Os testes de publicação também preservam livro anterior/aliases e recusam
motor divergente, profundidade insuficiente e avaliações com limites.

A mudança melhora a alocação do estudo offline; ganho de força permanece uma
hipótese até os resultados. Não foi treinada uma nova rede neural.
