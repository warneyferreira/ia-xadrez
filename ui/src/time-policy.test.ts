import { test, expect } from 'bun:test';
import { PhysicalTimePolicy } from './time-policy.ts';

test('margem física acompanha operação, limita outliers e reinicia por sessão', () => {
  const policy = new PhysicalTimePolicy();
  expect(policy.overheadMillis).toBe(2000);
  policy.observe(3500);
  expect(policy.overheadMillis).toBe(4000);
  expect(policy.reserveMillis).toBe(4250);
  policy.observe(120000);
  expect(policy.overheadMillis).toBe(8000);
  for (let i = 0; i < 12; i++) policy.observe(200);
  expect(policy.overheadMillis).toBe(1500);
  policy.observe(NaN);
  expect(policy.snapshot().observedMoves).toBe(12);
  policy.reset();
  expect(policy.overheadMillis).toBe(2000);
});
