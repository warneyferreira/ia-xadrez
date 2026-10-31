import { Chess } from 'chess.js';
import { Engine, type Score } from './engine.ts';

export function whiteScore(score: Score, turn: string): number {
  const value = score.unit === 'mate' ? Math.sign(score.value || 1) * 10000 : score.value;
  return turn === 'w' ? value : -value;
}

export function grade(loss: number, best: boolean): string {
  if (best) return 'Melhor';
  if (loss <= 20) return 'Excelente';
  if (loss <= 50) return 'Boa';
  if (loss <= 100) return 'Imprecisão';
  if (loss <= 200) return 'Erro';
  return 'Gafe';
}

export type ReviewRow = {
  ply: number;
  san: string;
  uci: string;
  whiteCp: number | null;
  lossCp: number | null;
  label: string;
  depth: number;
  explanation: string;
  alternative: string | null;
};

export async function review(
  engine: Engine,
  moves: string[],
  onProgress?: (done: number) => void,
): Promise<ReviewRow[]> {
  const game = new Chess();
  // Valida tudo antes de ocupar o processo de análise.
  for (const move of moves) game.move(move);
  game.reset();
  const rows: ReviewRow[] = [];
  let before = await engine.search([], 300);
  for (let i = 0; i < moves.length; i++) {
    const turn = game.turn();
    let alternative: string | null = null;
    try {
      alternative = new Chess(game.fen()).move(before.bestmove).san;
    } catch {
      /* Sem PV legal disponível. */
    }
    const move = game.move(moves[i]!);
    const after = game.isGameOver() ? null : await engine.search(moves.slice(0, i + 1), 300);
    const cpBefore = before.score ? whiteScore(before.score, turn) : null;
    const cpAfter = game.isCheckmate()
      ? game.turn() === 'w'
        ? -10000
        : 10000
      : game.isDraw()
        ? 0
        : after?.score
          ? whiteScore(after.score, game.turn())
          : null;
    const loss =
      cpBefore === null || cpAfter === null
        ? null
        : Math.max(0, Math.round((cpBefore - cpAfter) * (turn === 'w' ? 1 : -1)));
    const facts: string[] = [];
    const pieces: Record<string, string> = {
      p: 'peão',
      n: 'cavalo',
      b: 'bispo',
      r: 'torre',
      q: 'dama',
      k: 'rei',
    };
    if (move.isKingsideCastle() || move.isQueensideCastle())
      facts.push('O roque desloca o rei e ativa a torre.');
    else facts.push(`Move ${pieces[move.piece]} de ${move.from} para ${move.to}.`);
    if (move.captured)
      facts.push(`Captura ${pieces[move.captured]}${move.isEnPassant() ? ' por en passant' : ''}.`);
    if (move.promotion) facts.push(`Promove o peão a ${pieces[move.promotion]}.`);
    if (game.isCheckmate()) facts.push('Encerra a partida com xeque-mate.');
    else if (game.inCheck()) facts.push('Coloca o rei adversário em xeque.');
    if (game.isStalemate()) facts.push('Deixa o adversário sem lance legal e sem xeque: afogamento.');
    if (game.isThreefoldRepetition()) facts.push('A posição repetiu três vezes: empate por repetição.');
    if (loss !== null) facts.push(`Perda estimada de ${loss} centipeões em relação à análise anterior.`);
    if (before.bestmove === moves[i]) facts.push('Coincide com a primeira escolha da busca local.');
    else if (alternative) facts.push(`A busca local preferia ${alternative}.`);
    if (after?.pv?.length) {
      const variation = new Chess(game.fen());
      const line: string[] = [];
      for (const uci of after.pv.slice(0, 4)) {
        try {
          line.push(variation.move(uci).san);
        } catch {
          break;
        }
      }
      if (line.length) facts.push(`Continuação prevista: ${line.join(' ')}.`);
    }
    rows.push({
      ply: i + 1,
      san: move.san,
      uci: moves[i]!,
      whiteCp: cpAfter,
      lossCp: loss,
      label: loss === null ? 'Sem avaliação' : grade(loss, before.bestmove === moves[i]),
      depth: after?.depth ?? before.depth,
      explanation: facts.join(' '),
      alternative,
    });
    onProgress?.(i + 1);
    if (after) before = after;
  }
  return rows;
}
