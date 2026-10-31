# Scripts reproduzíveis

Scripts futuros de build, bench, arena e coleta devem registrar argumentos,
ambiente e saída. Não escreva scripts que baixem recursos no caminho de execução
de uma partida de competição.

- `build_candidate.py`: build isolado com PGO nativo Windows e arquitetura
  compatível, manifesto de fontes/NNUE/compilador/SHA e logs de cada etapa.
- `benchmark_engine.py`: aquecimento, ordem AB/BA, dados brutos e mediana de NPS.
- `test_strength.ps1`: resolve candidatos, fixa recursos iguais e gera confronto
  pareado; padrão 20 jogos em 25+0, que pode levar até 16 h 40 min de relógio.
- `validate_book.py`: revisão offline em duas buscas com Hash limpo e mínimo
  de profundidade; nunca ativa automaticamente o resultado experimental.
