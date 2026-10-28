# Como usar o projeto

## Pré-requisitos

- Git;
- ambiente Unix/WSL com `make` e compilador C++ para compilar o Stockfish;
- Node.js + npm para instalar as dependências da interface;
- Bun para rodar/empacotar a interface TypeScript.

O `ui/build.sh` foi escrito para Debian/WSL e também requer
`x86_64-w64-mingw32-g++` para gerar o `.exe` de Windows. No Windows puro, use
WSL ou adapte o processo de build deliberadamente; não presuma que `npm` por si
só compila o motor.

## Treino local, modo desenvolvimento

No WSL/Linux, a sequência é:

```bash
# 1. Compilar um motor local para desenvolvimento
make -C Stockfish/src -j"$(nproc)" build ARCH=x86-64-avx2

# 2. Instalar dependências travadas da interface
cd ui
npm ci

# 3. Abrir a interface (procura ../Stockfish/src/stockfish)
npm run dev
```

O navegador abre em `http://127.0.0.1:<porta>`. A aplicação permite escolher
as cores, tempo por lance e desfazer o par de lances. Ela é apropriada para
treino humano contra a IA.

Para verificar apenas a tipagem da UI:

```bash
cd ui
npm ci
npm run typecheck
```

## Pacote para distribuir

```bash
ui/build.sh       # gera engine universal + interface em bin/
ui/build.sh ui    # recompila somente a interface
```

O diretório `bin/` não entra no Git porque contém artefatos grandes. Para usar
o pacote, mantenha `ia-xadrez` e `stockfish` (ou suas versões `.exe`) na mesma
pasta. Para diagnóstico, use `--no-open`; para escolher outra engine UCI, use
`--engine <caminho>`.

## UCI direto

UCI é a conversa de texto entre GUI/controller e engine. Exemplo de sanidade:

```bash
cd Stockfish/src
./stockfish
uci
isready
position startpos moves e2e4 e7e5 g1f3
go movetime 10000
```

Espere `bestmove` antes de encerrar o processo. Enviar `quit` imediatamente
após `go` cancela a busca e invalida o teste.

## Configuração sugerida para medir, não para presumir

As recomendações históricas estão em `docs/uci-settings.md`, mas números de
threads, hash, NPS e temperatura só valem na máquina em que foram coletados.
Antes de competir, execute o protocolo de `docs/BASELINE.md` e registre o
resultado no hardware que será levado ao evento.

## O que não fazer com a UI

- não usá-la como relógio oficial de 25 minutos;
- não assumir que ela seleciona livro de aberturas ou Syzygy automaticamente;
- não considerar o `movetime` fixo um time manager de competição;
- não interpretar uma partida humana isolada como medição de Elo.
