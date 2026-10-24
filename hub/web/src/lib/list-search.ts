import {
  defaultOrder,
  type ListName,
  MEMORY_TYPES,
  type MemoryType,
  type Order,
  SORT_KEYS,
  type SortKey,
} from '../../../server/types.ts';

/** A list's state in the URL; absent fields mean the server default. */
export interface ListSearch<S extends string = string> {
  q?: string;
  sort?: S;
  order?: Order;
  offset?: number;
}

export interface MemorySearch extends ListSearch<SortKey<'memory'>> {
  type?: MemoryType;
}

const oneOf = <T extends string>(allowed: readonly T[], value: unknown): T | undefined =>
  allowed.find((v) => v === value);

/** Lenient `validateSearch`: bad values are dropped, and defaults too, so equal states share one URL. */
export function parseListSearch<L extends ListName>(
  list: L,
  raw: Record<string, unknown>,
): ListSearch<SortKey<L>> {
  const keys: readonly SortKey<L>[] = SORT_KEYS[list];
  // The router parses `q=123` as a number.
  const q = typeof raw.q === 'string' || typeof raw.q === 'number' ? String(raw.q) : '';
  const sort = oneOf(keys, raw.sort);
  const order = oneOf(['asc', 'desc'] as const, raw.order);
  const offset = Number(raw.offset);
  const search: ListSearch<SortKey<L>> = {};
  if (q) search.q = q;
  if (sort && sort !== keys[0]) search.sort = sort;
  if (order && order !== defaultOrder(sort ?? keys[0] ?? '')) search.order = order;
  if (Number.isInteger(offset) && offset > 0) search.offset = offset;
  return search;
}

export function parseMemorySearch(raw: Record<string, unknown>): MemorySearch {
  const type = oneOf(MEMORY_TYPES, raw.type);
  return type ? { ...parseListSearch('memory', raw), type } : parseListSearch('memory', raw);
}

const RESETS_OFFSET = ['q', 'sort', 'type'] as const;

/** Applies a toolbar change: a new filter, sort or type starts again at the first page. */
export function patchSearch<S extends ListSearch & { type?: string }>(prev: S, patch: Partial<S>): S {
  const next: S = { ...prev, ...patch };
  if (RESETS_OFFSET.some((key) => key in patch && patch[key] !== prev[key])) delete next.offset;
  // A new sort key takes its own default order.
  if ('sort' in patch && patch.sort !== prev.sort && !('order' in patch)) delete next.order;
  for (const key of Object.keys(next) as (keyof S)[]) {
    const value = next[key];
    if (value === undefined || value === '' || value === 0) delete next[key];
  }
  return next;
}

/** Query string for a list route; the server fills in what is left out. */
export function listSearchParams(search: ListSearch & { type?: string }): string {
  const params = new URLSearchParams();
  for (const key of ['q', 'sort', 'order', 'offset', 'type'] as const) {
    const value = search[key];
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}
