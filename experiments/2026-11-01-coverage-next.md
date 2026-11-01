# Próxima investigação — cobertura das aberturas

Enquanto a v6 disputa a bateria 25+0, foi preparado um diagnóstico que só lê
os registros existentes. Não muda o participante, o relógio ou as respostas.
`scripts/report_match.py` gera JSON com identidades, placar, tempos por lance,
avaliações disponíveis, respostas forçadas e posições prioritárias de revisão.

No piloto rápido de quatro jogos, a v6 teve 217 lances, 213 com avaliação
registrada e quatro preparados: **cobertura de 1,84%**. Seu pico de avaliação
foi +40 cp. Isso não demonstra que existia uma grande vantagem vencedora
que foi desperdiçada no final. É uma amostra curta e rápida, sem conclusão
estatística para o campeonato.

Hipótese seguinte: ampliar sequências conectadas ao repertório atual,
começando pelos meios-lances 2–12 das partidas realmente disputadas. A versão
atual tinha sementes em 8–12 e poucas respostas para os caminhos anteriores.
Preservar as respostas já verificadas ajuda a manter o começo dessas linhas.

O gerador agora aceita extensão por SHA do mesmo motor, valida a qualidade
herdada e prioriza históricos curtos. Recusa importar livro de outra rede.
Mates/empates encontrados na preparação são tratados pelas regras, sem pedir
uma PV impossível em posição terminal. A v6 publicada e sua preparação
permanecem congeladas; **nenhum candidato seguinte foi publicado**.

Receita preparada para executar depois de a máquina ficar livre:

```powershell
.\arena\.venv\Scripts\python.exe scripts/prepare_opponent.py --engine bin/arthur-v5-nnue19/stockfish.exe --extend-repertoire openings/arthur-v6-prepared.json --opponent bin/baseline-effdc3fd3/stockfish.exe --seed-pgn experiments/evidence/2026-11-01-prepared-v6/games.pgn --seed-min-ply 2 --seed-max-ply 12 --positions 24 --teacher-seconds 3 --reply-seconds 5 15 --verify-seconds 2 --verify-depth 26 --max-loss-cp 5 --output results/research/preparation-next-coverage
```

Não foi executada durante a bateria. Próximos critérios: verificar as entradas,
medir cobertura e tempo economizado, testar ON/OFF e comparar em 25+0 com
aberturas independentes. Mais entradas não comprovam maior força.

Testes novos verificam: leitura sem alterar as partidas; resultado com dama
extra ainda empatado por afogamento; eventos parciais sem empate inventado;
comparação das avaliações de um mesmo lado; preservação de entradas herdadas;
recusa de motor/qualidade diferentes; sementes sem duplicatas e casos terminais.
