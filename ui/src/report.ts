import type { ReviewRow } from './review.ts';

type Sample = {
  san: string;
  uci: string;
  elapsedMillis?: number;
  nodes?: number;
  nps?: number;
  depth: number;
  hashfull?: number;
  tbhits: number;
  source: string;
  whiteCp: number | null;
};
export function performanceReport(state: { rows: Sample[]; [key: string]: unknown }, analysis: ReviewRow[]) {
  const sides = (['white', 'black'] as const).map((color, parity) => {
    const samples = state.rows.filter((_, i) => i % 2 === parity);
    const judged = analysis.filter((_, i) => i % 2 === parity);
    const times = samples.map((r) => r.elapsedMillis ?? 0);
    const measured = state[color === 'white' ? 'whiteSearchMillis' : 'blackSearchMillis'];
    return {
      color,
      moves: samples.length,
      searchMillis: typeof measured === 'number' ? measured : times.reduce((a, b) => a + b, 0),
      interruptedSearchMillis:
        typeof measured === 'number' ? Math.max(0, measured - times.reduce((a, b) => a + b, 0)) : null,
      meanMoveMillis: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
      maxMoveMillis: times.length ? Math.max(...times) : null,
      nodes: samples.reduce((a, b) => a + (b.nodes ?? 0), 0),
      meanNps: samples.filter((r) => r.nps !== undefined).length
        ? samples.reduce((a, b) => a + (b.nps ?? 0), 0) / samples.filter((r) => r.nps !== undefined).length
        : null,
      maxDepth: samples.length ? Math.max(...samples.map((r) => r.depth)) : null,
      maxHashfullPermille: samples.length ? Math.max(...samples.map((r) => r.hashfull ?? 0)) : null,
      tablebaseHits: samples.reduce((a, b) => a + b.tbhits, 0),
      bookMoves: samples.filter((r) => r.source === 'Repertório').length,
      errors: judged.filter((r) => r.label === 'Erro').length,
      blunders: judged.filter((r) => r.label === 'Gafe').length,
      meanLossCp: judged.some((r) => r.lossCp !== null)
        ? judged.reduce((a, b) => a + (b.lossCp ?? 0), 0) / judged.filter((r) => r.lossCp !== null).length
        : null,
    };
  });
  return {
    schema: 'chess-challenge-report-v1',
    generatedAt: new Date().toISOString(),
    ...state,
    sides,
    analysis,
    interpretation:
      'Uma partida não estima Elo. NPS mede velocidade, Hashfull mede ocupação em permil. Explicações descrevem lances e uma busca posterior limitada, não a intenção interna da engine. Ausência de análise não significa ausência de erros.',
  };
}
