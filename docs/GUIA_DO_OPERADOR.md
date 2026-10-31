# Guia rápido do laboratório de torneio

## Abrir e observar

Execute `scripts/jogar.ps1` na raiz. A tela de treino é `/`, a de duelo é
`/duel` e a operação com tabuleiro físico é `/tournament`. O som é opcional,
desligado inicialmente e sintetizado localmente. O navegador exige uma
interação do usuário para liberar áudio. Movimentos, capturas, xeques, roque,
promoção e fim de partida têm sinais distintos. Durante uma rodada oficial,
use som somente se for apropriado no ambiente do evento.

## Repertório, recursos e finais

- **Repertório preparado:** posições e jogadas analisadas antes da partida.
  Economiza cálculo quando a posição está cadastrada. Deixe ligado para
  experimentar o sistema Arthur; desligue para comparar somente motores.
  O repertório atual é pequeno e preliminar, não é prova de vantagem.
- **Threads:** trabalhadores de busca da CPU. Mais threads aumentam uso de CPU
  e memória, mas o melhor número precisa ser medido no notebook aquecido.
- **Hash:** tabela de posições já pesquisadas. MB e GB são unidades de memória,
  não Elo nem tamanho da NNUE. `hashfull` é ocupação estimada em permil; a UI
  converte para porcentagem dividindo por 10.
- **Ponder:** busca durante a vez do adversário. No duelo automático fica
  desligado para evitar disputa de CPU e manter o teste controlado. A opção
  especulativa do treino é separada: aquece o Hash sobre uma previsão por até
  60 s e depois valida a jogada real; não implementa `ponderhit` completo.
- **Syzygy 3–5:** tabelas locais de finais exatos com até cinco peças incluindo
  reis. `tbhits` conta consultas, inclusive em finais encontrados em ramos da
  busca. Zero na última busca não significa que a base nunca foi usada.

## Duelo, reprise e relatórios

Selecione candidatos, nomes, cores, Hash e controle de tempo. Nomes são
identificação visual; os perfis e o relatório mostram a configuração real.
Exibição usa tempo fixo por lance. Controle 25+0 envia os relógios restantes
para a engine. Duração ativa exclui pausas; o relatório inclui a duração de
parede, que as inclui. Busca interrompida por pausa continua consumindo tempo.

No fim, um painel mostra vencedor/empate, motivo e pontos 3/1/0. A análise
posterior começa depois que as engines terminaram. Em pausa, pode ser solicitada
manualmente. O progresso é contado por posições efetivamente analisadas.
Use as setas/slider ou clique nas jogadas para rever o tabuleiro. Ao vivo volta
à posição mais recente. A avaliação e o material acompanham a posição escolhida.

Os ícones classificam Livro, Melhor da busca, Excelente, Boa, Imprecisão, Erro
e Gafe. Explicações descrevem os fatos do lance, perda estimada e alternativas
da busca. Não inferem intenção humana, não reproduzem o algoritmo do Chess.com
e não certificam jogada "perfeita" ou "brilhante". Uma análise mais profunda
pode mudar o rótulo; sacrifício não é automaticamente gafe ou genialidade.

**Baixar relatório de desempenho (JSON)** exporta configuração, SHA-256 dos
binários, origem, relógios, PGN, FENs, nós, NPS, Hash ocupado, profundidade,
consultas a finais e revisão disponível. Pode ser baixado sem análise, mas
isso fica identificado. Envie esse JSON em uma próxima conversa para investigar
erros, gasto de tempo e posições críticas. Também ficam cópias locais em logs.
Os relatórios/logs e os binários não são enviados ao Git por padrão.
O último duelo encerrado e sua revisão são restaurados após reiniciar o servidor.

## Operação física

Prepare a cor e 25 minutos, confira o tabuleiro e inicie junto com o relógio
físico. Registre o lance adversário em UCI (`e2e4`) ou SAN (`e4`, `Nf3`, `O-O`).
Confira a seta e a jogada calculada, mova a peça, pressione o relógio físico e
confirme. A confirmação não substitui movimentar a peça no tabuleiro.
Em Conferência é possível ajustar os relógios espelhados; isso fica no log.
Encerrar sessão salva o histórico no log e não declara resultado ao árbitro.

## Compartilhar com o Vanderlei

Git compartilha fontes, configurações, interface e cadastro de candidatos.
Não transfere automaticamente `stockfish.exe`, dependências npm/Python ou 1 GB
de tablebases. Na primeira instalação, consulte `scripts/setup.ps1` e
`scripts/build-engine.ps1`; o Windows precisa de Ubuntu-24.04/WSL, make e
compilador MinGW. Tablebases são opcionais com `setup.ps1 -WithTablebases`.

O cadastro conserva baseline e versões antigas. Vanderlei v2 deve ter novo ID,
branch/commit identificável e build próprio. `vanderlei-latest` pode apontar
para v2; reiniciar o servidor carrega o novo cadastro. Consulte candidates/README.
Promover "latest" não transforma o candidato na release de competição.

## Próximos experimentos de força

1. Comparar compilação PGO e arquiteturas adequadas à CPU, com carga sustentada.
2. Medir configurações de threads/Hash no controle 25+0, com aberturas pareadas.
3. Ampliar e validar repertório com partidas que não façam parte da seleção.
4. Testar uma hipótese pequena de gerenciamento de tempo contra baseline fixo.
5. Só integrar mudanças com força/estabilidade medidas; comparar também com a
   versão recente do colega, sem apagar a referência congelada.
