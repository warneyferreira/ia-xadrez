import { Chess } from 'chess.js';

let game = new Chess();
let active = false;
let timer: ReturnType<typeof setTimeout> | undefined;
function reply(depth: number) {
  if (!active) return;
  clearTimeout(timer);
  active = false;
  const best = game.moves({ verbose: true })[0]?.lan ?? '0000';
  const copy = new Chess(game.fen());
  let predicted = '';
  if (best !== '0000') {
    copy.move(best);
    predicted = copy.moves({ verbose: true })[0]?.lan ?? '';
  }
  if (process.argv.includes('--prepared')) {
    console.log(`info string PreparedRepertoire ${'a'.repeat(64)}`);
    console.log(`info depth 24 nodes 0 time 0 pv ${best}`);
  } else console.log(`info depth ${depth} score cp 20 nodes ${depth * 100} nps 10000 time 10 pv ${best}`);
  console.log(`bestmove ${best}${predicted ? ` ponder ${predicted}` : ''}`);
}
for await (const raw of console) {
  if (raw === 'uci') console.log('id name Ponder protocol fixture\nuciok');
  else if (raw === 'isready') console.log('readyok');
  else if (raw.startsWith('position ')) {
    game = new Chess();
    const tail = raw.split(' moves ')[1];
    for (const move of tail?.split(' ') ?? []) game.move(move);
  } else if (raw.startsWith('go ponder')) {
    active = true;
    console.log('info depth 7 score cp 20 nodes 700 nps 10000 time 10 pv e2e4');
  } else if (raw.startsWith('go ')) {
    active = true;
    timer = setTimeout(() => reply(4), 10);
  } else if (raw === 'ponderhit') reply(9);
  else if (raw === 'stop') reply(3);
  else if (raw === 'quit') break;
}
