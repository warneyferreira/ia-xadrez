# Arthur v1 — primeiro candidato de configuração

Base: árvore `Stockfish/` do commit `effdc3fd3` do fork vondele.
Build: MinGW GCC 13 POSIX, x86-64-avx2, O3/LTO, sem PGO.
NNUE: nn-c9e480e92425.nnue (SHA-256 verificado).

Hipótese de força: Hash de 256 MB pode reter mais posições que 128 MB em
buscas longas. Um teste de 15 segundos só verifica integração; não prova Elo.
Risco: mais memória; aumento de força não garantido.

Modo treino: preparação especulativa opcional de até 60 segundos após o lance
previsto do adversário. O cálculo aquece a tabela hash; a resposta real inicia
uma busca validada e pode reutilizar a tabela. Não é `go ponder/ponderhit` e
não deve ser confundido com a prova de melhor jogada possível.

Arena: `arena/configs/arthur-v1-vs-base.json`, dois jogos, cores alternadas,
Ponder desligado para ambos, Threads=4. Só Hash difere. A vantagem especulativa
não está sendo medida por essa configuração da arena.

Rejeitar se ocorrer crash ou regressão repetível. Retestar com amostra grande
e controle 25+0 antes de decidir a configuração de competição.

Primeiro teste real: Hash=1024 MB falhou na alocação nesta máquina; 2 falhas
de inicialização em 2 jogos. Configuração rejeitada. Perfil reduzido para
256 MB versus referência 128 MB para novo smoke test. Isso não reproduz as
configurações particulares do Vanderlei, apenas o código-base do repositório.

Resultado r3 após encerrar processos anteriores deste projeto: 2 jogos em
15+0.1, 0 vitórias, 2 empates, 0 derrotas, 0 crashes, 0 inacabados. Smoke test
de integração aprovado. Força: RETEST, sem evidência de ganho de Elo.

Repertório gerado: 36 posições com análise de 0,5 s por posição. Disponível
opcionalmente no treino; não foi usado no confronto A/B. As classificações
visuais usam análise de 300 ms por posição e são aproximações locais.
