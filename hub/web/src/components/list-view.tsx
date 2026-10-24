import type { UseQueryResult } from '@tanstack/react-query';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Empty, ErrorBox } from '@/components/query-state';
import { Button } from '@/components/ui/button';
import { ApiError, type Page } from '@/lib/api';
import type { ListSearch } from '@/lib/list-search';
import { cn } from '@/lib/utils';
import { defaultOrder, LIST_LIMIT_DEFAULT, type Order } from '../../../server/types.ts';

const FILTER_DEBOUNCE_MS = 200;
const DATE_ORDER: Record<Order, string> = { desc: 'Newest first', asc: 'Oldest first' };
const TEXT_ORDER: Record<Order, string> = { asc: 'A–Z', desc: 'Z–A' };

const label = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

function FilterBox({
  value,
  onChange,
  noun,
}: {
  value: string;
  onChange: (q: string) => void;
  noun: string;
}) {
  const [text, setText] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Follow back/forward navigation, but don't clobber typing that hasn't been sent yet.
  useEffect(() => {
    if (timer.current === undefined) setText(value);
  }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <label className="flex h-8 min-w-48 flex-1 items-center gap-2 rounded-md border border-input bg-background px-2 focus-within:ring-[3px] focus-within:ring-ring/50">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <input
        type="search"
        value={text}
        maxLength={200}
        placeholder={`Filter ${noun}`}
        aria-label={`Filter ${noun}`}
        className="h-full w-full bg-transparent text-sm outline-none"
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            timer.current = undefined;
            onChange(next);
          }, FILTER_DEBOUNCE_MS);
        }}
      />
    </label>
  );
}

interface ToolbarProps<S extends string> {
  search: ListSearch<S>;
  sortKeys: readonly S[];
  onSearch: (patch: Partial<ListSearch<S>>) => void;
  noun: string;
  page: Page<unknown> | undefined;
}

/** Filter box, sort select with an order toggle, and Prev/Next; every change goes to the URL. */
export function ListToolbar<S extends string>({ search, sortKeys, onSearch, noun, page }: ToolbarProps<S>) {
  const sort = search.sort ?? sortKeys[0] ?? '';
  const order = search.order ?? defaultOrder(sort);
  const flipped = order === 'asc' ? 'desc' : 'asc';
  // Keys that default to newest first are dates.
  const orderLabel = (defaultOrder(sort) === 'desc' ? DATE_ORDER : TEXT_ORDER)[order];
  const offset = search.offset ?? 0;
  const shown = page?.items.length ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-2" data-section="list-toolbar">
      <FilterBox value={search.q ?? ''} onChange={(q) => onSearch({ q })} noun={noun} />
      {sortKeys.length > 1 && (
        <select
          aria-label="Sort by"
          value={sort}
          onChange={(e) => {
            const next = sortKeys.find((k) => k === e.target.value);
            onSearch({ sort: next === sortKeys[0] ? undefined : next });
          }}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          {sortKeys.map((key) => (
            <option key={key} value={key}>
              {label(key)}
            </option>
          ))}
        </select>
      )}
      <Button
        variant="outline"
        size="sm"
        aria-label={`Order: ${orderLabel}. Click to reverse.`}
        onClick={() => onSearch({ order: flipped === defaultOrder(sort) ? undefined : flipped })}
      >
        {order === 'asc' ? <ArrowUpNarrowWide aria-hidden /> : <ArrowDownWideNarrow aria-hidden />}
        {orderLabel}
      </Button>
      <div className="ml-auto flex items-center gap-2">
        {page && page.total > 0 && shown > 0 && (
          <span className="text-sm tabular-nums text-muted-foreground" data-section="list-range">
            {offset + 1}–{offset + shown} of {page.total}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          aria-label="Previous page"
          disabled={offset === 0}
          onClick={() => onSearch({ offset: Math.max(0, offset - LIST_LIMIT_DEFAULT) })}
        >
          <ChevronLeft aria-hidden />
          Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          aria-label="Next page"
          disabled={page?.nextOffset == null}
          onClick={() => page?.nextOffset != null && onSearch({ offset: page.nextOffset })}
        >
          Next
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </div>
  );
}

/** Toggle chips for a single-choice filter; "All" clears it. */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label: groupLabel,
}: {
  options: readonly T[];
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  label: string;
}) {
  const chip = (text: string, active: boolean, next: T | undefined) => (
    <Button
      key={text}
      variant={active ? 'secondary' : 'ghost'}
      size="sm"
      aria-pressed={active}
      className={cn('h-7 rounded-full px-3', active && 'ring-1 ring-border')}
      onClick={() => onChange(next)}
    >
      {text}
    </Button>
  );
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would add a border and legend we don't want here.
    <div role="group" aria-label={groupLabel} className="flex flex-wrap gap-1">
      {chip('All', value === undefined, undefined)}
      {options.map((option) => chip(option, value === option, option))}
    </div>
  );
}

interface ListViewProps<S extends string, P extends Page<unknown>> extends Omit<ToolbarProps<S>, 'page'> {
  query: UseQueryResult<P>;
  /** Extra controls under the toolbar, such as type chips. */
  filters?: ReactNode;
  /** True when a filter other than `q` narrows the list. */
  filtered?: boolean;
  /** Shown when the list has nothing in it at all. */
  empty: ReactNode;
  children: (page: P) => ReactNode;
}

/** A server-paged list: toolbar, then loading, error, empty or the page itself. */
export function ListView<S extends string, P extends Page<unknown>>({
  query,
  filters,
  filtered = false,
  empty,
  children,
  ...toolbar
}: ListViewProps<S, P>) {
  const { search, onSearch } = toolbar;
  const narrowed = filtered || Boolean(search.q);
  const page = query.data;

  let body: ReactNode;
  if (query.isPending) body = <p className="text-sm text-muted-foreground">Loading...</p>;
  else if (query.isError)
    body =
      query.error instanceof ApiError && query.error.status === 400 ? (
        <ErrorBox error={new Error(`The hub couldn't read this list query: ${query.error.message}`)} />
      ) : (
        <ErrorBox error={query.error} />
      );
  else if (page && page.items.length > 0) body = children(page);
  else if (page && page.total > 0)
    body = (
      <Empty>
        Nothing on this page.{' '}
        <button type="button" className="underline" onClick={() => onSearch({ offset: 0 })}>
          Back to the first page
        </button>
      </Empty>
    );
  else body = narrowed ? <Empty>No matches.</Empty> : <Empty>{empty}</Empty>;

  return (
    <div className="space-y-3">
      <ListToolbar {...toolbar} page={page} />
      {filters}
      <div
        aria-busy={query.isFetching}
        className={cn('transition-opacity', query.isPlaceholderData && 'opacity-60')}
      >
        {body}
      </div>
    </div>
  );
}
