# Diagnóstico de conversão — v1

`conversion-v1.json` conserva três posições do relatório local
`duel-1793426427256`, mais três casos exatos de mate, resposta única e final
empatado. O arquivo registra a impressão digital do relatório de origem.

As referências Kf2, Ra7 e Rfb1 são **hipóteses de pesquisa**, obtidas em uma
análise mais longa. Não são prova de vitória forçada. Acertar essas posições
não comprova ganho de Elo e não deve ser o único critério de seleção.

`scripts/research_positions.py` compara buscas de 0,25 s, 3 s e 10 s, usando
uma thread e Hash 128 MB. Salva lance, avaliação, profundidade, nós e duração.
Casos exatos recebem uma verificação separada; o caso Syzygy fica sem
verificação exata se as bases locais estiverem ausentes.

Esse processo não treina a NNUE. Ele ajuda a identificar decisões sensíveis
ao tempo de busca. Depois de formular uma mudança, valide-a em posições e
aberturas novas, conservando baseline e recursos comparáveis.
