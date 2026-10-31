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
