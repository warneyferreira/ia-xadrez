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

## Atualização de desempenho — Arthur v2

A v2 é um candidato de compilação PGO, com AVX-VNNI nesta máquina. A rede e a
lógica do Stockfish continuam as mesmas. Medimos 9,14% mais nós/s na mediana
de seis rodadas em uma thread; todas pesquisaram exatamente 8.539.195 nós.
Na série curta 6+0,06 com cores pareadas, foram 1 vitória, 19 empates e zero
derrotas/travamentos. Isso é evidência inicial de estabilidade e velocidade,
não comprovação de Elo ou do resultado no controle 25+0.

O perfil mantém duas threads e Hash 256 MB para isolar a compilação. A varredura
1/2/4/6/8 threads fica nos registros; NPS maior com mais threads não mede,
sozinho, a utilidade da busca paralela. Antes de fixar outro perfil de competição,
use `scripts/test_strength.ps1` com recursos iguais e tempo oficial.

O repertório preliminar não fica habilitado na v2. `scripts/validate_book.py`
reanalisa cada posição duas vezes, limpa o Hash entre buscas e só aceita lances
iguais com profundidade mínima. O resultado continua experimental e precisa
ser comparado em partidas antes de ativação.

A primeira revisão conservou 36 posições, profundidade 21–27, e mudou 12
jogadas. Os arquivos `openings/arthur-v2-verified.*` documentam essa preparação;
eles não substituem o repertório ativo da v1 nem habilitam livro na v2.

No tabuleiro físico, a reserva de operação começa em 2 s por lance e acompanha
as últimas 12 confirmações (percentil 90 + 500 ms, entre 1,5 e 8 s). Ela informa
o `Move Overhead` nativo, limitado a 5 s nesta versão, e uma reserva externa
completa com mais 250 ms antes de o relógio zerar. O motor
continua decidindo como distribuir seu tempo. Essa política reduz risco
operacional; não cria tempo adicional no relógio oficial.

## Arena de testes e fila local

Abra **Arena de testes** no menu (`/arena`) depois de reiniciar a interface
com o código atualizado. A página acompanha as baterias iniciadas pelo
terminal e permite preparar novas. Mostra partidas concluídas, V/E/D,
pontos 3/1/0, recursos reais de cada motor e arquivos para baixar.

Na série de 8 jogos 25+0, cada partida pode consumir até 50 minutos de relógio;
a série inteira pode chegar a 6 h 40 min, mais preparação. O progresso só
conta jogos encerrados. A série antiga, iniciada antes desta atualização,
não envia posição por lance; isso fica explicado na tela. Novas séries enviam
tabuleiro e relógios. Ausência de processo e resumo é tratada como interrupção.

As aberturas vêm de `openings/validation-holdout.pgn`: dez linhas iniciais de
famílias diferentes. Uma semente fixa embaralha a lista de forma reproduzível.
Cada posição é disputada com as cores trocadas. Oito jogos cobrem quatro
posições; vinte cobrem as dez. Isso reduz a influência da abertura/cor na
comparação. Não é um repertório escolhido pelo motor para vencer.

Durante uma bateria, o servidor atualizado recusa novos duelos, análises e
partidas físicas para evitar competição pela CPU. Acompanhar o placar e
baixar resultados continua possível. Uma janela antiga do servidor precisa
ser encerrada pelo operador e reaberta para receber as mudanças.

No duelo visual, **25+0** usa os relógios reais, sem um tempo fixo por lance.
A seleção de 0,25/1/5 s fica oculta nesse modo. A primeira jogada pode levar
dezenas de segundos; profundidade e nós aparecem durante a busca.

Para deixar a fila posterior, execute na raiz do projeto:

```powershell
.\arena\.venv\Scripts\python.exe scripts/research_queue.py --after results/arena/match-20261031-031514-070
```

Ela espera a bateria terminar, testa o protocolo real, analisa seis posições
e executa um piloto rápido de 4 vs 2 threads. É processamento local, sem
chamadas ao GPT. Não treina a rede e não substitui automaticamente o candidato.
Mantenha o PC ligado e sem suspensão. O estágio e a pasta dos relatórios ficam
em `results/arena/research-queue.json` e na arena. **Concluída** significa que
os relatórios foram produzidos; **falhou**, **bloqueada** ou **interrompida**
exigem investigar os logs. Traga os relatórios para escolher o próximo ajuste.

## Respostas rápidas e Ponder físico experimental

A tela física oferece **Pensar no tempo do adversário (experimental)**,
desligado por padrão. Prepare novamente a sessão para mudar essa opção.
Se o adversário confirmar a previsão, a mesma busca continua com `ponderhit`.
Se jogar diferente, a previsão é descartada e a posição real é pesquisada.
O sistema mostra previsões, acertos, descartes e tempo de cálculo reaproveitado.

Quando só existe um lance legal, o controlador o entrega imediatamente e
indica que não houve avaliação. Isso não permite antecipar uma jogada antes
de saber a resposta adversária. Perto do fim do relógio, há um teto de busca
curto para preservar a margem de operação. O relógio físico segue soberano.
Valide o Ponder com o motor real antes de ativar em competição.

Duelo pausado também é restaurado ao reiniciar; o tempo com o programa fechado
não corre nesse duelo de laboratório. O histórico e a identidade dos motores
são conferidos antes de continuar. O relógio de competição física não recebe
essa regra de pausa.
