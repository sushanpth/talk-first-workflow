import { useNavigate, useSearch } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CodeSearchParams } from '@/lib/code-api';
import { CODE_SEARCH_QUERY_MAX } from '../../../server/code-types.ts';

/** Search box in the code toolbar; it drives the search route. */
export function CodeSearchForm({ project }: { project: string }) {
  const current: CodeSearchParams = useSearch({ strict: false });
  const navigate = useNavigate();
  const [text, setText] = useState(current.q ?? '');
  const [matchCase, setMatchCase] = useState(current.case ?? false);
  // Follow back/forward and links that change the search.
  useEffect(() => setText(current.q ?? ''), [current.q]);
  useEffect(() => setMatchCase(current.case ?? false), [current.case]);

  const run = (q: string, caseSensitive: boolean) => {
    if (q === '') return;
    navigate({
      to: '/p/$project/code/search',
      params: { project },
      search: { q, case: caseSensitive || undefined },
    });
  };

  return (
    <form
      className="flex min-w-64 flex-1 items-center gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(text, matchCase);
      }}
    >
      <label className="flex h-8 flex-1 items-center gap-2 rounded-md border border-input bg-background px-2 focus-within:ring-[3px] focus-within:ring-ring/50">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={text}
          maxLength={CODE_SEARCH_QUERY_MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search in files (exact text)"
          aria-label="Search in files"
          className="h-full flex-1 bg-transparent text-sm outline-none"
        />
      </label>
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={matchCase}
          onChange={(e) => {
            setMatchCase(e.target.checked);
            if (current.q) run(text, e.target.checked);
          }}
        />
        Match case
      </label>
    </form>
  );
}
