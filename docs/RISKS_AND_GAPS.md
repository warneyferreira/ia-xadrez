# Riscos e lacunas até a release de torneio

## Bloqueadores práticos

| Lacuna | Consequência | Próxima ação |
| --- | --- | --- |
| Arena A/B inexistente | não há como demonstrar ganho de Elo | implementar runner com cores alternadas, openings, PGNs e relatório |
| Baseline no notebook do evento não registrado | configurações de threads/hash podem estar erradas | executar `docs/BASELINE.md` no hardware final |
| UI de treino não tem relógio oficial | risco de perder por tempo | projetar controller com relógio próprio e `go wtime/btime` |
| Sem watchdog externo/log estruturado | crash ou estado inválido pode custar uma partida | implementar supervisão, heartbeat e log de eventos |
| Livro não integrado | vantagem permitida não está pronta | confirmar regra e escolher GUI/wrapper local apropriado |
| Syzygy não instalado/verificado | finais teóricos não estão cobertos | baixar/validar 3-4-5 peças em SSD, se permitido |
| Testes de UI ausentes | regressões de operação passam despercebidas | adicionar testes de protocolo UCI e fluxos críticos |

## Riscos técnicos específicos encontrados

- A UI usa `go movetime`; isso é correto para treino, mas não aproveita nem
  protege o relógio de uma partida de 25 minutos.
- A configuração da UI fixa Hash em 256 MB e usa todas as threads disponíveis.
  É uma escolha razoável para buscas de segundos, não uma configuração validada
  para a competição.
- A aplicação reconstrói a posição a partir de `startpos` e histórico de lances.
  Ela não aceita FEN/partida retomada, o que limita recuperação operacional.
- O pacote de interface não tem suite de testes automatizada; só há typecheck.
- O build empacotado é universal. É conveniente para distribuição, mas o build
  de competição deve ser comparado com uma compilação PGO/nativa no hardware alvo.

## Oportunidades de maior valor

1. **Arena + evidência estatística:** permite separar ganhos reais de ruído.
2. **Controller resiliente de 25+0:** pode converter força existente em pontos ao
   evitar erros de operação e administrar o tempo corretamente.
3. **Livro local preparado:** se confirmado permitido, economiza tempo e pode
   escolher famílias de posições favoráveis sem tocar na busca.
4. **Tablebases locais:** baixo risco quando integradas e testadas em SSD.
5. **Time manager específico para 25+0:** boa contribuição autoral, mas somente
   depois de haver baseline e arena.

Search e NNUE são oportunidades posteriores: têm alto potencial, mas também o
maior risco de regressão silenciosa.
