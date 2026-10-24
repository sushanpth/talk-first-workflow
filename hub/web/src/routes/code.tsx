import { Link, Outlet, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { Check, ChevronLeft, ChevronRight, Link2, Search } from 'lucide-react';
import { lazy, type ReactNode, Suspense, useEffect, useState } from 'react';
import { CodeTree } from '@/components/code-tree';
import { Empty, ErrorBox, QueryState } from '@/components/query-state';
import { QuickOpen } from '@/components/quick-open';
import { Button } from '@/components/ui/button';
import {
  CODE_SEARCH_PAGE_SIZE,
  type CodeMatch,
  type CodeSearchParams,
  useCodeFile,
  useCodeSearch,
} from '@/lib/code-api';
import { cn } from '@/lib/utils';
import { CODE_SEARCH_MAX_MATCHES, CODE_SEARCH_QUERY_MAX } from '../../../server/code-types.ts';

const CodeViewer = lazy(() => import('@/components/code-viewer'));

const positiveInt = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : undefined;
};

export const parseCodeFileSearch = (search: Record<string, unknown>): { line?: number } => ({
  line: positiveInt(search.line),
});

export const parseCodeSearch = (search: Record<string, unknown>): CodeSearchParams => ({
  q: typeof search.q === 'string' && search.q !== '' ? search.q.slice(0, CODE_SEARCH_QUERY_MAX) : undefined,
  case: search.case === true || search.case === 'true' || search.case === 1 ? true : undefined,
  offset: positiveInt(search.offset),
});

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const QUICK_OPEN_KEY = isMac ? '⌘P' : 'Ctrl+P';

/** Search box in the code toolbar; it drives the search route. */
function SearchForm({ project }: { project: string }) {
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

export function CodeLayout() {
  const { project } = useParams({ from: '/p/$project/code' });
  const { _splat: current } = useParams({ strict: false });
  const [quickOpen, setQuickOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') {
        // Capture phase, so this beats the browser's print and the editor's own keys.
        e.preventDefault();
        e.stopPropagation();
        setQuickOpen(true);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setQuickOpen(true)}>
          Go to file
          <kbd className="font-mono text-xs text-muted-foreground">{QUICK_OPEN_KEY}</kbd>
        </Button>
        <SearchForm project={project} />
      </div>
      <div className="grid h-[calc(100vh-14rem)] min-h-96 grid-cols-[16rem_1fr] gap-3">
        <aside className="overflow-auto rounded-md border p-1" data-section="code-tree">
          <CodeTree key={project} project={project} current={current} />
        </aside>
        <section className="flex min-w-0 flex-col overflow-hidden" data-section="code-main">
          <Outlet />
        </section>
      </div>
      {quickOpen && <QuickOpen project={project} onClose={() => setQuickOpen(false)} />}
    </div>
  );
}

export function CodeIndexPage() {
  return (
    <div className="rounded-md border p-6">
      <Empty>
        Pick a file from the tree, press {QUICK_OPEN_KEY} to open one by name, or search inside files above.
      </Empty>
    </div>
  );
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() =>
        navigator.clipboard?.writeText(window.location.href).then(
          () => setCopied(true),
          () => undefined,
        )
      }
    >
      {copied ? <Check aria-hidden /> : <Link2 aria-hidden />}
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CodeFilePage() {
  const { project, _splat: path = '' } = useParams({ from: '/p/$project/code/$' });
  const { line } = useSearch({ from: '/p/$project/code/$' });
  const navigate = useNavigate({ from: '/p/$project/code/$' });
  const query = useCodeFile(project, path);
  let body: ReactNode;
  if (query.isPending) body = <Empty>Loading...</Empty>;
  else if (query.isError) body = <ErrorBox error={query.error} />;
  else if (query.data.binary) body = <Empty>Binary file; not shown.</Empty>;
  else if (query.data.tooLarge || query.data.content === null) {
    body = <Empty>Too large to show ({formatSize(query.data.size)}).</Empty>;
  } else {
    body = (
      <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading editor...</p>}>
        <CodeViewer
          key={path}
          path={path}
          content={query.data.content}
          line={line}
          onLineClick={(n) => navigate({ search: { line: n }, replace: true })}
        />
      </Suspense>
    );
  }
  const simple = query.isPending || query.isError || query.data.content === null;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground">
          {path}
          {query.data && ` · ${formatSize(query.data.size)}`}
          {line && ` · line ${line}`}
        </p>
        <CopyLinkButton />
      </div>
      <div className={cn('min-h-0 flex-1 overflow-hidden rounded-md border', simple && 'p-4')}>{body}</div>
    </div>
  );
}

/** Splits `text` around case-(in)sensitive matches of `q` for highlighting. */
function highlight(text: string, q: string, matchCase: boolean): ReactNode[] {
  const hay = matchCase ? text : text.toLowerCase();
  const needle = matchCase ? q : q.toLowerCase();
  const out: ReactNode[] = [];
  let from = 0;
  for (let at = hay.indexOf(needle); needle && at !== -1; at = hay.indexOf(needle, from)) {
    out.push(text.slice(from, at), <mark key={at}>{text.slice(at, at + needle.length)}</mark>);
    from = at + needle.length;
  }
  out.push(text.slice(from));
  return out;
}

function groupByFile(matches: CodeMatch[]): { path: string; matches: CodeMatch[] }[] {
  const groups: { path: string; matches: CodeMatch[] }[] = [];
  for (const m of matches) {
    const last = groups.at(-1);
    if (last?.path === m.path) last.matches.push(m);
    else groups.push({ path: m.path, matches: [m] });
  }
  return groups;
}

export function CodeSearchPage() {
  const { project } = useParams({ from: '/p/$project/code/search' });
  const search = useSearch({ from: '/p/$project/code/search' });
  const navigate = useNavigate({ from: '/p/$project/code/search' });
  const query = useCodeSearch(project, search);
  const q = search.q ?? '';
  if (q === '') return <Empty>Type some text in the search box above.</Empty>;

  const goTo = (offset: number) => navigate({ search: (prev) => ({ ...prev, offset: offset || undefined }) });
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <QueryState query={query}>
        {(page) => {
          const offset = search.offset ?? 0;
          return (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>
                  {page.total === 0
                    ? 'No matches.'
                    : `Matches ${offset + 1}–${offset + page.items.length} of ${page.total}`}
                </span>
                {page.truncated && (
                  <span className="text-amber-600 dark:text-amber-400">
                    (stopped early at the {CODE_SEARCH_MAX_MATCHES}-match or time limit; narrow the search)
                  </span>
                )}
                <span className="ml-auto flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset === 0}
                    onClick={() => goTo(Math.max(0, offset - CODE_SEARCH_PAGE_SIZE))}
                  >
                    <ChevronLeft aria-hidden /> Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page.nextOffset === null}
                    onClick={() => page.nextOffset !== null && goTo(page.nextOffset)}
                  >
                    Next <ChevronRight aria-hidden />
                  </Button>
                </span>
              </div>
              {groupByFile(page.items).map((group) => (
                <section key={group.path} className="rounded-md border">
                  <Link
                    to="/p/$project/code/$"
                    params={{ project, _splat: group.path }}
                    className="block border-b bg-muted/50 px-3 py-1.5 font-mono text-xs font-semibold hover:underline"
                  >
                    {group.path}
                  </Link>
                  <ul>
                    {group.matches.map((m) => (
                      <li key={m.line}>
                        <Link
                          to="/p/$project/code/$"
                          params={{ project, _splat: m.path }}
                          search={{ line: m.line }}
                          className="flex gap-3 px-3 py-0.5 font-mono text-xs hover:bg-accent"
                        >
                          <span className="w-10 shrink-0 text-right text-muted-foreground">{m.line}</span>
                          <span className="min-w-0 truncate whitespace-pre">
                            {highlight(m.text, q, search.case ?? false)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
