# Candidatos e referências

`registry.json` é o cadastro compartilhado. IDs de versões são imutáveis:
`arthur-v1`, `vanderlei-base`, `vanderlei-v2` etc. Os aliases `arthur-latest` e
`vanderlei-latest` apontam para uma versão explícita e podem avançar sem apagar
as anteriores. Não altere `vanderlei-base` nem a branch `baseline` para guardar
uma novidade: elas são as referências congeladas.

O motor herdado está em `Stockfish/`. Na versão inicial, ambos os perfis usam
esse mesmo binário congelado em `bin/baseline-effdc3fd3/`; o diferencial é configuração/repertório/Syzygy. A interface
mostra os IDs reais resolvidos, e o relatório registra o SHA-256 dos binários.

Para registrar uma nova versão do Vanderlei, na raiz:

```powershell
py -3 scripts/register_candidate.py --id vanderlei-v2 --owner vanderlei --name "Vanderlei v2" --source-commit HASH_DO_COMMIT --engine bin/vanderlei-v2/stockfish.exe --latest
```

Use um commit real e um binário compilado daquele código. O script não faz
download, build, commit nem push automaticamente. Ajuste `threads`, `hashMB`,
`book` e `syzygy` no registro da nova versão antes de compartilhá-la. O arquivo
do executável fica fora do Git; disponibilize a branch/tag de origem e o comando
de build. Todos precisam compilar/instalar o binário no mesmo caminho relativo.

Depois de `git pull`, reinicie o servidor. No seletor de duelo, escolha
`vanderlei-latest` ou uma versão fixa. Os IDs usados são congelados no início de
cada partida: atualizar o registro não muda uma partida em andamento.

Execute sempre os dois tipos de comparação: candidato × baseline congelado e
candidato × versão recente do colega. Só enfrentar uma referência que muda
impede saber se houve progresso real ao longo do tempo.

`scripts/build-baseline.ps1` compila a referência do commit histórico `6867444`
em pasta separada, mesmo se `Stockfish/` já tiver mudanças de pesquisa. Não
sobrescreve um slot existente. Uma v2 deve apontar para outro binário, como
`bin/vanderlei-v2/stockfish.exe`, para a atualização não substituir a base.

## Arthur v2 · PGO

Usa o mesmo código/NNUE da referência, recompilado com perfil de buscas reais.
O cadastro fixa o commit e pede arquitetura `auto`: AVX-VNNI se a CPU oferecer,
AVX2 caso contrário. O manifesto local registra qual variante foi realmente
compilada. Um ID fixa a receita, mas o SHA do executável identifica o artefato
exato; compiladores/arquiteturas diferentes não são a mesma condição de teste.

`scripts/setup.ps1` prepara os candidatos com receita `build` cadastrada.
Para compilar apenas este, em um slot ainda inexistente:

```powershell
py -3 scripts/build_candidate.py --id arthur-v2 --revision db2cf72047c7e88a267c4b690f40dc1763efd318 --arch auto --pgo
```

O livro preliminar fica desativado na v2. A comparação de compilação mantém
Threads/Hash iguais e não usa Syzygy para nenhum lado; no uso normal a v2
continua podendo consultar as tabelas locais de finais.

Mais velocidade não equivale a uma porcentagem igual de vitórias. Consulte
`experiments/2026-10-31-pgo-clock.md` para resultado e limitações reais.

## Arthur v3 · tempo crítico (experimental)

Adiciona uma opção nativa própria, `Tournament Critical Time`, com limite de
fator 1,20 para o orçamento alvo em posições instáveis. Não muda a NNUE nem
relaxa o teto nativo. Fica desligada no executável por padrão; o cadastro ativa
a opção apenas para `arthur-v3-critical`. V2 e baseline permanecem preservados.

O seletor de duelo/arena permite testar a v3 após reiniciar o servidor. Para
preparar uma interface física separada, sem trocar `arthur-latest`:

```powershell
.\scripts\jogar.ps1 -Candidate arthur-v3-critical -Port 18767
```

O perfil usa duas threads e Hash 256 MB. A mudança só atua em controle de
relógio sem incremento; tempo fixo por lance não exercita a política. Ela
permanece experimental até uma validação de força em 25+0. Consulte
`experiments/2026-10-31-critical-time-v1.md`.

## Arthur v4 · preparação offline

Compartilha explicitamente o binário da v2 (`engineId: arthur-v2`) e acrescenta
um controlador UCI com 39 respostas preparadas. O arquivo é protegido por SHA,
confere histórico/FEN e volta ao Stockfish quando não há resposta preparada.
O modo de análise não usa o livro. Não foi treinada uma nova NNUE.

No duelo, escolha a v4 e mantenha marcada a preparação. Desmarcar permite
comparar sem ela. O relatório identifica origem, quantidade de respostas
preparadas, SHA da preparação e do controlador. A arena mostra explicitamente
que esse perfil é uma comparação de sistema completo, com conhecimento offline.

Para operar o tabuleiro físico com esse perfil:

```powershell
.\scripts\jogar.ps1 -Candidate arthur-v4-prepared
```

Os aliases antigos permanecem preservados. Ganho de tempo operacional não
certifica ganho de força em 25+0; consulte o experimento da v4.

## Arthur v5 · NNUE19

Atualiza o núcleo e a rede para o commit oficial `ff7cee4244ec96ea488c402669e3674c0574dce6`.
É uma mudança na avaliação das posições, com arquitetura específica também
para finais sem damas nem torres. Os pesos são do projeto Stockfish; a v5
não é uma rede treinada pela equipe. A receita fixa origem e commit, compila
com PGO e incorpora a rede ao executável para funcionar offline.

O cadastro fica separado da v4: não reutiliza automaticamente o repertório
preparado para outra rede. `arthur-latest` continua na referência v2 até
avaliação local. Consulte `experiments/2026-11-01-nnue19-v5.md` para resultados
e limites; a aprovação dos testes upstream não garante vitória no torneio.

## Arthur v6 · preparação NNUE19

Mesmo núcleo da v5, com dez respostas próprias dessa rede, verificadas em
profundidade 26. O cadastro compartilha o motor por `engineId` e registra o
SHA do livro. Não usa o livro antigo da v4. Selecionável no duelo e na arena;
para treino/tabuleiro físico: `scripts/jogar.ps1 -Candidate arthur-v6-prepared`.

Novos candidatos aparecem no seletor do duelo em até dez segundos sem apagar
o nome ou a seleção. Se uma aba antiga não tiver esse comportamento, atualize
com F5. O endereço padrão atualizado é `http://127.0.0.1:18766`.
A v6 é experimental: preparação poupa cálculo quando o histórico coincide;
ganho de força precisa ser avaliado nas partidas.
