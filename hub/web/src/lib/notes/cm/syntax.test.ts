import { describe, expect, it } from 'vitest';
import { wikiLinkAt } from './syntax.ts';
import { stateOf } from './test-utils.ts';

describe('wikiLinkAt', () => {
  it('finds the link under a position but not inside code', () => {
    const state = stateOf('a [[One]] `[[Two]]`');
    expect(wikiLinkAt(state, 5)?.target).toBe('One');
    expect(wikiLinkAt(state, 13)).toBeUndefined();
  });
});
