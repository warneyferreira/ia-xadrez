# Assistir Arthur × base do repositório

Abra http://127.0.0.1:18766/duel. Edite os dois nomes, escolha a cor do perfil
Arthur e o tempo por lance e clique **Iniciar novo duelo**. O servidor joga
sozinho e o navegador acompanha. Pausar interrompe a busca sem aplicar uma
resposta atrasada; Continuar retoma da mesma posição. PGN salva o histórico.

Cada lado mostra nome, cor e perfil real. O nome "Vanderlei · base" indica
somente a referência do repositório, e não as configurações pessoais dele.
Ambos usam a mesma engine compilada, 2 threads e Ponder desligado. Arthur usa
Hash 256 MB, repertório opcional e Syzygy local quando instalado; a referência
usa Hash 128 MB. Essa comparação é entre sistemas/configurações; não demonstra
uma modificação da busca do Stockfish.

A exibição usa tempo fixo por lance para visualização rápida. O controle de
competição é 25 minutos por lado e precisa ser validado na arena separadamente.
Troque as cores, repita e registre resultados. Um único resultado não escolhe
o candidato da equipe.

## Syzygy offline

Instalador: `arena/.venv/Scripts/python.exe scripts/install_syzygy.py`.
Verificação: `arena/.venv/Scripts/python.exe scripts/verify_syzygy.py`.
Destino: `%LOCALAPPDATA%/ChessChallenge/syzygy/3-4-5` (fora do OneDrive).
Fonte HTTPS: `https://tablebase.lichess.ovh/tables/standard/3-4-5-wdl/` e
`https://tablebase.lichess.ovh/tables/standard/3-4-5-dtz/`.

São 145 WDL + 145 DTZ. O instalador verifica cabeçalhos, comprimentos e grava
hashes SHA-256 locais; a verificação relê os arquivos e testa probes com
python-chess e Stockfish. Os hashes locais verificam integridade após baixar,
não substituem um catálogo independente de checksums do fornecedor.

`scripts/jogar.ps1` configura o caminho automaticamente após a instalação.
Não existe acesso a API de finais durante a partida. A cobertura é de posições
com até 5 peças, contando os reis; restrições como roque afetam a consulta.
`tbhits` no duelo informa consultas da última busca, não percentual de força.

## Regulamento conferido em 30/10/2026

Fonte: PDF local `Downloads/Chess-Challenge-III.pdf`, quatro páginas.
Vitória 3 pontos; empate 1; ranqueamento menciona ELO; empate na classificação
final prevê partida adicional. Semifinal e final mencionam melhor de 3.
Tempo: 25 minutos por lado, derrota por estouro ou falha de software.

O texto se contradiz entre "5 quatro" rodadas, oitavas e "8 melhores" em
semifinais. Não especifica o desempate de série com jogos empatados. Isso
precisa ser esclarecido pela organização; o sistema não inventa regra de
vitória por material ou por quantidade de damas.

Objetivo competitivo: buscar 3 pontos quando houver oportunidades objetivas,
preservar 1 ponto em posições defendíveis e converter finais ganhos. Não há
configuração que assegure classificação ou transforme empate em vitória.
