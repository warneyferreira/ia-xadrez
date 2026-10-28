# Arena

Este diretório será o executor de confrontos candidate-vs-baseline. Ainda está
vazio por escolha: não simule uma arena com scripts ad-hoc sem registro de
configuração.

O primeiro incremento deve aceitar duas engines UCI, alternar cores, impor o
mesmo conjunto de openings, salvar PGN/logs e emitir W/D/L, crashes e metadados
com seed reproduzível. Resultados grandes devem ir para `results/`, e PGNs para
`pgn/` (ambos ignorados por padrão, exceto manifestos pequenos).
