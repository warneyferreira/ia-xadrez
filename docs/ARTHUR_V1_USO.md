# Arthur v1: como jogar e entender as métricas

Abra http://127.0.0.1:18766/ enquanto o servidor estiver ligado. Para reiniciar,
execute `powershell -ExecutionPolicy Bypass -File scripts/jogar.ps1` na pasta
do projeto. O script depende do binário já compilado e das dependências locais.

1. Escolha sua cor e tempo de cálculo por lance e clique Nova partida.
2. Ative abertura preparada para usar o repertório local de 36 posições.
3. Ative IA pensa durante minha vez para ela calcular após a resposta que
   prevê do humano. São até 60 segundos de busca especulativa. Uma nova busca
   valida a resposta real e pode aproveitar a memória já calculada. Não é
   ponderhit UCI nem uma garantia de ter descoberto a melhor jogada possível.
4. Pré-movimento humano permite deixar um lance preparado enquanto a IA pensa.
   O tabuleiro só o executa se ele continuar legal. Isso é diferente da
   preparação especulativa da engine.
5. Analisar jogadas executa uma análise local, de aproximadamente 300 ms por
   posição. Ela mostra perda estimada em centipeões e um gráfico da avaliação
   branca. Os rótulos não reproduzem o algoritmo proprietário do Chess.com.
6. Salvar PGN exporta a partida; Abrir partida salva importa um PGN para revisão.

Material usa P=1, C/B=3, T=5 e D=9. É contagem de peças, não previsão de vitória.
A barra usa avaliação da engine sob a perspectiva branca: mais branca indica
vantagem branca. Não é porcentagem calibrada de vitória.

Classificação por perda estimada: até 20 cp Excelente; até 50 Boa; até 100
Imprecisão; até 200 Erro; acima de 200 Gafe. Melhor é o lance escolhido pela
busca naquela posição. Profundidade limitada e diferenças entre buscas podem
mudar a classificação. Não há selo de perfeição ou genialidade.

Compilação realizada: MinGW GCC 13 POSIX / x86-64-avx2 / O3+LTO, sem PGO.
Rede NNUE validada por SHA-256. Fonte Stockfish preservada.
Configuração de execução: até 4 threads, Hash 256 MB, Move Overhead 500 ms.

Teste real inicial: 2 empates, 0 crashes no confronto de Hash 256 versus 128 MB
em 15+0.1. Isso verifica integração, não demonstra ganho de força. Testes
anteriores falharam por alocação de memória e ficam preservados nos resultados.

Atualização: Syzygy 3–5 foi instalado e verificado (290 arquivos) após corrigir
as URLs para os diretórios separados WDL/DTZ. A interface agora tem também
duelo com 25+0, reprise e relatório. Consulte docs/GUIA_DO_OPERADOR.md.
Pendências de força: testes longos 25+0 em volume, benchmark térmico,
comparação estatística extensa, otimização PGO e experimentos internos de tempo.
A tela de torneio continua requerendo ensaio com relógio físico.

Validação: typecheck, testes de classificação, empate por afogamento, protocolo
UCI com engine real, interrupção de preparação e jogos reais da arena. A versão
atual foi verificada também em navegador automatizado, desktop e celular,
incluindo pausa/retomada, reprise, relatório, PGN e operação física.
