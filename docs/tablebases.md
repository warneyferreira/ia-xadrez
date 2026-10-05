# Tablebases Syzygy

Bases de finais resolvidos com perfeição. Quando a posição entra no número de peças coberto,
o Stockfish para de estimar e passa a **saber** o resultado (vitória/empate/derrota) e a
distância até a conversão. Elimina 100% dos erros de final dentro da cobertura.

## O que são os dois tipos de arquivo

| Tipo | Responde | Uso na busca |
|---|---|---|
| **WDL** (`.rtbw`) | Ganha / empata / perde | Consultado dentro da busca, muito rápido |
| **DTZ** (`.rtbz`) | Lances até zerar a regra dos 50 | Consultado na raiz, para escolher o lance que converte |

Você precisa dos **dois**. Só WDL sabe o resultado mas pode embaralhar peças sem progredir.

## Tamanhos e custo (valores aproximados)

| Cobertura | Tamanho total | Veredito |
|---|---|---|
| 3-4-5 peças | ~1 GB | **Baixar. Sem discussão.** |
| 6 peças | ~150 GB | Vale se houver disco; ganho real mas raro |
| 7 peças | ~18 TB | Inviável aqui. Esqueça. |

Seu disco tem ~644 GB livres — 6 peças cabe, mas consome 23% do disco.

## Ganho de força esperado

- **5 peças**: ganho pequeno em Elo puro (o Stockfish moderno já joga finais de 5 peças
  quase perfeitamente), mas **elimina a categoria inteira de erro** em finais técnicos e
  converte empates teóricos que a avaliação erraria.
- **6 peças**: ganho adicional pequeno; aparece em finais de torres com peões e finais
  de peças menores. Em torneio engine-vs-engine, onde muitas partidas chegam a finais
  longos, é onde meio ponto é decidido.
- Contra oponentes fracos, o ganho é ~zero (a partida acaba antes). Contra outro Stockfish,
  importa.

## Onde baixar

Fonte oficial recomendada (mirror do Lichess, rápido e com rsync):

- HTTP: `https://tablebase.lichess.ovh/tables/standard/3-4-5/`
- HTTP: `https://tablebase.lichess.ovh/tables/standard/6-wdl/` e `6-dtz/`
- Rsync (melhor para retomar download grande): `rsync://tablebase.lichess.ovh/tables/standard/`

Alternativas: `http://tablebase.sesse.net/syzygy/`.

### Comando para 3-4-5 peças

```bash
mkdir -p ~/syzygy/345
cd ~/syzygy/345
rsync -avP --delete rsync://tablebase.lichess.ovh/tables/standard/3-4-5/ .
```

Sem `rsync`, use `wget`:

```bash
wget -r -np -nH --cut-dirs=4 -R "index.html*" \
  https://tablebase.lichess.ovh/tables/standard/3-4-5/
```

### Comando para 6 peças (~150 GB, deixe rodando)

```bash
mkdir -p ~/syzygy/6
rsync -avP rsync://tablebase.lichess.ovh/tables/standard/6-wdl/ ~/syzygy/6/
rsync -avP rsync://tablebase.lichess.ovh/tables/standard/6-dtz/ ~/syzygy/6/
```

## Configuração no Stockfish

```
setoption name SyzygyPath value /home/usuario/syzygy/345
setoption name SyzygyProbeDepth value 1
setoption name Syzygy50MoveRule value true
setoption name SyzygyProbeLimit value 7
```

Múltiplos diretórios são separados por `:` no Linux e por `;` no Windows:

```
setoption name SyzygyPath value C:\syzygy\345;C:\syzygy\6
```

### Significado das opções

| Opção | Recomendado | Observação |
|---|---|---|
| `SyzygyPath` | caminho(s) das bases | Vazio = desligado |
| `SyzygyProbeDepth` | `1` | Sonda em toda profundidade. Aumente só se as bases estiverem em HDD lento |
| `Syzygy50MoveRule` | `true` | `false` ignora a regra dos 50 lances — só para análise teórica, **errado em torneio** |
| `SyzygyProbeLimit` | `7` (padrão) | Limita o nº máximo de peças sondadas |

## Onde colocar os arquivos (importante para desempenho)

- **SSD/NVMe**, nunca HDD. A sondagem é aleatória e sensível a latência.
- **Evite caminho cruzando WSL↔Windows** (`/mnt/c/...` a partir do WSL): o 9p é lento.
  Se a engine rodar nativa no Windows, guarde em disco Windows; se rodar no WSL,
  guarde dentro do sistema de arquivos do WSL (`~/syzygy`).
- Os arquivos são somente leitura e mapeados em memória; não precisam caber na RAM.

## Verificação de que funcionou

Rode um final coberto e confira `tbhits > 0`:

```bash
{ printf 'setoption name SyzygyPath value /home/usuario/syzygy/345\nposition fen 8/8/8/8/8/4k3/4P3/4K3 w - - 0 1\ngo depth 30\n'; sleep 5; } | ./stockfish | tail -2
```

Esperado: `tbhits` diferente de zero e avaliação em formato de mate/`cp` extremo,
não uma estimativa comum. Se `tbhits` continuar 0, o caminho está errado.

## Checklist

- [ ] Baixar 3-4-5 (~1 GB)
- [ ] Apontar `SyzygyPath`
- [ ] Confirmar `tbhits > 0` no teste acima
- [ ] Decidir sobre 6 peças (~150 GB) conforme disco e tempo
