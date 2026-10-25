import { describe, expect, it } from 'vitest';
import { findWikiLinks, TAG, wikiLinkAt } from './syntax.ts';
import { stateOf } from './test-utils.ts';

describe('findWikiLinks', () => {
  it('reads target, heading and alias with offsets', () => {
    expect(findWikiLinks('see [[Groceries#Dairy|milk]] now', 10)).toEqual([
      { target: 'Groceries', heading: 'Dairy', alias: 'milk', from: 14, to: 38 },
    ]);
  });

  it('skips empty links', () => {
    expect(findWikiLinks('[[]] [[ ]]')).toEqual([]);
  });
});

describe('wikiLinkAt', () => {
  it('finds the link under a position but not inside code', () => {
    const state = stateOf('a [[One]] `[[Two]]`');
    expect(wikiLinkAt(state, 5)?.target).toBe('One');
    expect(wikiLinkAt(state, 13)).toBeUndefined();
  });
});

describe('TAG', () => {
  it('matches tags but not headings, numbers or mid-word hashes', () => {
    expect('#todo a#b # h #1 (#x/y-z)'.match(TAG)).toEqual(['#todo', '#x/y-z']);
  });
});
