# Evidência — Critical Time v1

- `25m-original.pgn` e resumo: oito jogos anteriores, preservados. Sete
  reclamações antecipadas de repetição, uma partida com material insuficiente.
- `repetition-audit.json`: pesquisa de 3 s/MultiPV2 com a v2, histórico completo.
  Não identifica vitória forçada nas alternativas examinadas.
- `original-thread-pilot-summary.json`: piloto anterior 4 vs 2 threads; 12
  empates. A política antiga não deve ser misturada com a nova.
- `build.json`: origem, rede, compilador e hash do novo candidato.
- `validation.json`: assinatura de bench e dez buscas de regressão.
- `pilot.pgn`, eventos e resumo: quatro jogos 45+0, mesmo binário, opção ON/OFF.
  A política nova espera a terceira repetição efetiva. Quatro empates.
- `pilot-recipe.json`: mesmos parâmetros, caminhos normalizados para o repo.
  Use uma pasta de saída nova para reproduzir sem sobrescrever evidências.
- `checksums.json`: SHA-256 dos arquivos de dados acima.

Decisão: **RETEST**, sem promoção automática nem Elo comprovado. Os binários
e bases grandes ficam fora do Git. Consulte o registro do experimento para
hipótese, limites, regressões e próximas condições de validação.
