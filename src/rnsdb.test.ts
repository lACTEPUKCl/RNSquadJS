import { describe, expect, it } from 'vitest';
import { splitDenseParties } from './rnsdb';

const fromPairs = (pairs: Array<[string, string, number]>) => {
  const m = new Map<string, number>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const [a, b, w] of pairs) m.set(key(a, b), w);
  return (a: string, b: string) => m.get(key(a, b)) ?? 0;
};

describe('splitDenseParties', () => {
  it('малая компонента (≤ maxParty) остаётся целой', () => {
    const w = fromPairs([
      ['a', 'b', 5],
      ['b', 'c', 5],
    ]);
    expect(splitDenseParties(['a', 'b', 'c'], w, 6)).toEqual([['a', 'b', 'c']]);
  });

  it('одиночка не образует пати', () => {
    expect(splitDenseParties(['a'], fromPairs([]), 6)).toEqual([]);
  });

  it('большая компонента режется по плотности на тесные ядра', () => {
    const pairs: Array<[string, string, number]> = [];
    const cliqueA = ['a', 'b', 'c', 'd'];
    const cliqueB = ['e', 'f', 'g', 'h'];
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) {
        pairs.push([cliqueA[i], cliqueA[j], 100]);
        pairs.push([cliqueB[i], cliqueB[j], 100]);
      }
    pairs.push(['d', 'e', 1]);
    const w = fromPairs(pairs);

    const parts = splitDenseParties([...cliqueA, ...cliqueB], w, 4);
    expect(parts.length).toBe(2);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(4);
    const sorted = parts.map((p) => p.slice().sort()).sort();
    expect(sorted).toEqual([
      ['a', 'b', 'c', 'd'],
      ['e', 'f', 'g', 'h'],
    ]);
  });
});
