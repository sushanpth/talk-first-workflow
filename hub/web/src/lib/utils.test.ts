import { describe, expect, it } from 'vitest';
import { chunk } from './utils.ts';

describe('chunk', () => {
  it('splits into batches of at most the given size', () => {
    const refs = Array.from({ length: 205 }, (_, i) => `f${i}.ts`);
    expect(chunk(refs, 100).map((c) => c.length)).toEqual([100, 100, 5]);
    expect(chunk([], 100)).toEqual([]);
  });
});
