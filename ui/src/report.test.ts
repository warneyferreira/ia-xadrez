import { test, expect } from 'bun:test';
import { performanceReport } from './report.ts';

test('relatório separa tempos e não inventa erro sem revisão', () => {
  const report = performanceReport(
    {
      rows: [
        {
          san: 'e4',
          uci: 'e2e4',
          whiteCp: null,
          depth: 18,
          source: 'Repertório',
          tbhits: 0,
          elapsedMillis: 1,
        },
        {
          san: 'e5',
          uci: 'e7e5',
          whiteCp: 12,
          depth: 20,
          source: 'Busca',
          tbhits: 2,
          elapsedMillis: 500,
          nodes: 1000,
          nps: 2000,
          hashfull: 20,
        },
      ],
      whiteSearchMillis: 101,
    },
    [],
  );
  expect(report.sides[0]!.interruptedSearchMillis).toBe(100);
  expect(report.sides[0]!.meanLossCp).toBeNull();
  expect(report.sides[0]!.maxDepth).toBeNull();
  expect(report.sides[0]!.maxPreparedDepth).toBe(18);
  expect(report.sides[1]!.nodes).toBe(1000);
  expect(report.sides[1]!.tablebaseHits).toBe(2);
});
