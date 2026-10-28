# Chess Challenge III — IA Xadrez

Repositório de preparação da equipe para o Chess Challenge III (ICEV 2026).
O projeto combina uma base de engine forte, uma interface local para operação e
infraestrutura de medição. O objetivo não é modificar o motor sem evidência:
cada mudança deve ser pequena, reproduzível e comparada com o baseline.

## Estado atual

| Área | Estado |
| --- | --- |
| Motor | Cópia exata de `vondele/Stockfish` no commit `effdc3fd3f6de6e75fe1374a51a7a7eed66f880b` |
| Licença do motor | GPLv3; atribuições preservadas em `Stockfish/` |
| Interface local | TypeScript/Bun; joga contra o motor via UCI em `127.0.0.1` |
| Arena estatística | Ainda não implementada |
| Controller de competição | Ainda não implementado; a UI atual é para treino, não para comandar uma partida oficial |
| Baseline de hardware | Pendente de protocolo reproduzível e de execução na máquina de competição |

## Como se orientar

- [Mapa técnico do projeto](docs/architecture/PROJECT_MAP.md) — o que cada pasta e componente faz.
- [Como compilar e usar](docs/USAGE.md) — comandos e fluxo de treino local.
- [Baseline e medição](docs/BASELINE.md) — o que registrar antes de experimentar.
- [Autoria, origem e licença](docs/authorship/ORIGINS.md) — separação explícita do código herdado e do código da equipe.
- [Modelo de experimento](docs/EXPERIMENT_TEMPLATE.md) — requisito para qualquer mudança de força.
- [Riscos de competição](docs/RISKS_AND_GAPS.md) — lacunas que impedem usar isto como release de torneio hoje.

## Estrutura

```text
Stockfish/         motor herdado; não editar diretamente no baseline
ui/                interface de treino local (Bun + TypeScript)
docs/              documentação de uso, arquitetura, medidas e operação
arena/             futuro executor de partidas A/B
experiments/       propostas e registros de experimentos pequenos
results/           resultados tabulares versionáveis (sem binários grandes)
logs/              logs locais, ignorados pelo Git
pgn/               PGNs de testes, ignorados pelo Git
openings/          metadados e manifestos de livros; não os livros binários
tablebases-config/ configuração de Syzygy, sem as bases grandes
scripts/           automações reproduzíveis de build, bench e arena
datasets/          manifestos de dados; não datasets pesados
```

## Regras de trabalho

1. A branch `baseline` acompanha o estado importado e deve ficar imutável.
2. Trabalhe em `experiment/<tema>-vN` ou `dev/<tema>`; um patch por hipótese.
3. Não conclua ganho de Elo por NPS, por uma posição ou por poucas partidas.
4. Não remova atribuições, licença ou arquivos de `Stockfish/`.
5. Nunca dependa de internet no caminho de execução da competição.

Consulte o contexto mestre antes de qualquer mudança no motor.
