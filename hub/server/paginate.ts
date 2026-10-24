import type { ListQuery, Page } from './types.ts';

/** How one list is searched and sorted. */
export interface ListSpec<T, S extends string> {
  /** Fields `q` matches against. */
  text: (item: T) => (string | null)[];
  /** Sort value per allowed key; null sorts last in either order. */
  keys: Record<S, (item: T) => string | null>;
}

// Fixed locale so order doesn't depend on the machine; numeric so "v10" follows "v9".
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** Filters on `q`, sorts stably by the query's key and order, then slices one page. */
export function paginate<T, S extends string>(
  items: T[],
  query: ListQuery<S>,
  spec: ListSpec<T, S>,
): Page<T> {
  const q = query.q.toLowerCase();
  const matches = q
    ? items.filter((item) => spec.text(item).some((field) => field?.toLowerCase().includes(q)))
    : [...items];
  const key = spec.keys[query.sort];
  const sign = query.order === 'desc' ? -1 : 1;
  matches.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return sign * collator.compare(x, y);
  });
  const end = query.offset + query.limit;
  return {
    items: matches.slice(query.offset, end),
    total: matches.length,
    nextOffset: end < matches.length ? end : null,
  };
}
