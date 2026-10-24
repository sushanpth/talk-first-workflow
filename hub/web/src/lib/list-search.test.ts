import { describe, expect, it } from 'vitest';
import {
  type ListSearch,
  listSearchParams,
  parseListSearch,
  parseMemorySearch,
  patchSearch,
  prevOffset,
} from './list-search.ts';

describe('parseListSearch', () => {
  it('keeps valid values', () => {
    expect(parseListSearch('plans', { q: 'merge', sort: 'title', order: 'desc', offset: 50 })).toEqual({
      q: 'merge',
      sort: 'title',
      order: 'desc',
      offset: 50,
    });
  });

  it('drops values the list does not allow', () => {
    expect(parseListSearch('plans', { sort: 'name', order: 'up', offset: -1 })).toEqual({});
    expect(parseListSearch('docs', { offset: 1.5 })).toEqual({});
    expect(parseListSearch('docs', { offset: 'x' })).toEqual({});
  });

  it('reads numbers and strings the router may hand back', () => {
    expect(parseListSearch('docs', { q: 123, offset: '50' })).toEqual({ q: '123', offset: 50 });
  });

  it('drops defaults so equal states share one URL and one cache entry', () => {
    expect(parseListSearch('plans', { q: '', sort: 'date', order: 'desc', offset: 0 })).toEqual({});
    expect(parseListSearch('plans', { sort: 'title', order: 'asc' })).toEqual({ sort: 'title' });
    expect(parseListSearch('plans', { order: 'asc' })).toEqual({ order: 'asc' });
    expect(parseListSearch('memory', { sort: 'modified', order: 'desc' })).toEqual({ sort: 'modified' });
  });
});

describe('parseMemorySearch', () => {
  it('keeps a known type and drops an unknown one', () => {
    expect(parseMemorySearch({ type: 'feedback', sort: 'type' })).toEqual({ type: 'feedback', sort: 'type' });
    expect(parseMemorySearch({ type: 'other' })).toEqual({});
  });
});

describe('patchSearch', () => {
  it('resets the offset when the filter changes', () => {
    expect(patchSearch({ q: 'a', offset: 50 }, { q: 'ab' })).toEqual({ q: 'ab' });
  });

  it('keeps the offset when the filter is unchanged', () => {
    expect(patchSearch({ q: 'a', offset: 50 }, { q: 'a' })).toEqual({ q: 'a', offset: 50 });
  });

  it('keeps the filter when paging', () => {
    expect(patchSearch<ListSearch>({ q: 'a' }, { offset: 50 })).toEqual({ q: 'a', offset: 50 });
    expect(patchSearch({ q: 'a', offset: 50 }, { offset: 0 })).toEqual({ q: 'a' });
  });

  it('resets offset and order when the sort key changes', () => {
    expect(patchSearch({ sort: 'title', order: 'desc', offset: 50 }, { sort: undefined })).toEqual({});
  });

  it('resets the offset when the memory type changes', () => {
    expect(patchSearch({ type: 'user', offset: 50 }, { type: 'project' })).toEqual({ type: 'project' });
    expect(patchSearch({ type: 'user', offset: 50 }, { type: undefined })).toEqual({});
  });

  it('drops an empty filter', () => {
    expect(patchSearch({ q: 'a' }, { q: '' })).toEqual({});
  });
});

describe('prevOffset', () => {
  it('steps back by the page size the server used', () => {
    expect(prevOffset(40, 20, 20)).toBe(20);
    expect(prevOffset(150, 50, 50)).toBe(100);
  });

  it('steps back a full page from a short last page', () => {
    expect(prevOffset(40, 20, 3)).toBe(20);
  });

  it('falls back to the items shown when the size is unknown', () => {
    expect(prevOffset(40, undefined, 20)).toBe(20);
  });

  it('never goes below zero, and goes to the start from an empty page', () => {
    expect(prevOffset(10, 20, 10)).toBe(0);
    expect(prevOffset(500, undefined, 0)).toBe(0);
  });
});

describe('listSearchParams', () => {
  it('sends only the values that are set', () => {
    expect(listSearchParams({})).toBe('');
    expect(listSearchParams({ q: 'a b', sort: 'title', offset: 50 })).toBe('?q=a+b&sort=title&offset=50');
    expect(listSearchParams({ type: 'user', order: 'desc' })).toBe('?order=desc&type=user');
  });
});
