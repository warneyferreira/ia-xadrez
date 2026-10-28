# Origem, autoria e licença

## Motor herdado

`Stockfish/` é uma cópia de árvore idêntica a:

```text
repositório: https://github.com/vondele/Stockfish
commit:      effdc3fd3f6de6e75fe1374a51a7a7eed66f880b
data:        2026-10-17
licença:     GNU GPL v3 (ver Stockfish/Copying.txt)
```

Essa identidade foi conferida comparando a árvore Git do commit acima com a
subárvore `HEAD:Stockfish`; os hashes são iguais. Portanto, neste ponto, a
equipe **não deve apresentar o motor como código próprio**, nem alegar ganho de
força próprio apenas por tê-lo importado.

Também permanecem no repositório os avisos e autores em `Stockfish/AUTHORS`,
`Stockfish/Copying.txt` e demais arquivos upstream. Eles não devem ser
removidos ou reescritos.

## Contribuições já presentes fora do motor

| Componente | Origem/autor no histórico deste repositório | Papel |
| --- | --- | --- |
| `ui/` | commit `6867444` | interface local de treino que conversa com a engine por UCI |
| `docs/` | histórico do repositório | guias de UCI, tablebases, livro e interface |
| organização de competição | branch `dev/project-scaffold` | documentação, governança e áreas de medição |

## Como registrar contribuição da equipe

Para cada contribuição, registre em um commit pequeno e em `experiments/`:

- problema e hipótese;
- arquivo(s) alterado(s);
- commit do baseline contra o qual foi comparada;
- configuração completa de build e teste;
- resultado, incerteza e decisão (aceitar, rejeitar ou repetir).

Para distribuição de binários que incorporem o Stockfish, preserve a licença
GPLv3 e disponibilize o código-fonte correspondente, conforme exigido pela
licença. Em caso de dúvida jurídica ou sobre as regras do evento, valide com a
organização antes da entrega.
