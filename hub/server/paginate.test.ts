import { describe, expect, it } from 'vitest';
import { type ListSpec, paginate } from './paginate.ts';
import { type ListQuery, listQuerySchemas, type SortKey } from './types.ts';

interface Item {
  name: string;
  note: string | null;
  date: string | null;
}

const items: Item[] = [
  { name: 'beta', note: 'Redis keys', date: '2026-10-02' },
  { name: 'Alpha', note: null, date: '2026-10-03' },
  { name: 'Gamma', note: 'auth cookies', date: null },
  { name: 'delta', note: 'Auth tokens', date: '2026-10-01' },
];

const spec: ListSpec<Item, 'name' | 'date'> = {
  text: (i) => [i.name, i.note],
  keys: { name: (i) => i.name, date: (i) => i.date },
};

const query = (over: Partial<ListQuery<'name' | 'date'>> = {}): ListQuery<'name' | 'date'> => ({
  q: '',
  sort: 'name',
  order: 'asc',
  limit: 50,
  offset: 0,
  ...over,
});
const names = (over: Partial<ListQuery<'name' | 'date'>> = {}) =>
  paginate(items, query(over), spec).items.map((i) => i.name);

describe('paginate', () => {
  it('filters case-insensitively on any text field and counts matches before slicing', () => {
    expect(names({ q: 'AUTH' })).toEqual(['delta', 'Gamma']);
    expect(names({ q: 'alp' })).toEqual(['Alpha']);
    expect(names({ q: 'nothing' })).toEqual([]);
    expect(paginate(items, query({ q: 'auth', limit: 1 }), spec)).toMatchObject({ total: 2, nextOffset: 1 });
  });

  it('sorts by each key, ignoring case, and puts null keys last in either order', () => {
    expect(names({ sort: 'name' })).toEqual(['Alpha', 'beta', 'delta', 'Gamma']);
    expect(names({ sort: 'name', order: 'desc' })).toEqual(['Gamma', 'delta', 'beta', 'Alpha']);
    expect(names({ sort: 'date' })).toEqual(['delta', 'beta', 'Alpha', 'Gamma']);
    expect(names({ sort: 'date', order: 'desc' })).toEqual(['Alpha', 'beta', 'delta', 'Gamma']);
  });

  it('keeps the input order for equal keys', () => {
    const same = [
      { name: 'b', note: null, date: '2026-01-01' },
      { name: 'a', note: null, date: '2026-01-01' },
      { name: 'c', note: null, date: '2026-01-01' },
    ];
    for (const order of ['asc', 'desc'] as const) {
      expect(paginate(same, query({ sort: 'date', order }), spec).items.map((i) => i.name)).toEqual([
        'b',
        'a',
        'c',
      ]);
    }
  });

  it('does not reorder the input array', () => {
    const copy = [...items];
    paginate(copy, query({ sort: 'date' }), spec);
    expect(copy).toEqual(items);
  });

  it('slices by limit and offset and reports the next offset', () => {
    expect(paginate(items, query({ limit: 2 }), spec)).toEqual({
      items: [items[1], items[0]],
      total: 4,
      nextOffset: 2,
    });
    expect(paginate(items, query({ limit: 2, offset: 2 }), spec)).toMatchObject({
      total: 4,
      nextOffset: null,
    });
    expect(names({ limit: 2, offset: 2 })).toEqual(['delta', 'Gamma']);
    expect(paginate(items, query({ limit: 3, offset: 1 }), spec)).toMatchObject({
      total: 4,
      nextOffset: null,
    });
    expect(paginate(items, query({ offset: 10 }), spec)).toEqual({ items: [], total: 4, nextOffset: null });
    expect(paginate([], query(), spec)).toEqual({ items: [], total: 0, nextOffset: null });
  });
});

describe('list query defaults', () => {
  const parse = (raw: Record<string, string>) => listQuerySchemas.plans.parse(raw);

  it('uses the first sort key with its default order', () => {
    expect(parse({})).toEqual({ q: '', sort: 'date', order: 'desc', limit: 50, offset: 0 });
    expect(parse({ sort: 'title' }).order).toBe('asc');
  });

  it('sorts plans newest first by default through paginate', () => {
    const plans = [
      { title: 'old', date: '2026-01-01' },
      { title: 'new', date: '2026-10-01' },
    ];
    const planSpec: ListSpec<(typeof plans)[number], SortKey<'plans'>> = {
      text: (p) => [p.title],
      keys: { date: (p) => p.date, title: (p) => p.title },
    };
    expect(paginate(plans, parse({}), planSpec).items.map((p) => p.title)).toEqual(['new', 'old']);
  });

  it('rejects bad values', () => {
    for (const raw of [
      { sort: 'size' },
      { order: 'up' },
      { limit: '0' },
      { limit: '201' },
      { limit: 'x' },
      { offset: '-1' },
      { offset: '1.5' },
    ]) {
      expect(listQuerySchemas.plans.safeParse(raw).success, JSON.stringify(raw)).toBe(false);
    }
    expect(listQuerySchemas.memory.safeParse({ type: 'other' }).success).toBe(false);
  });
});
