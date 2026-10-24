import { Link, Outlet, useMatch, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ChevronLeft, ChevronRight, GitCompareArrows } from 'lucide-react';
import { lazy, type ReactNode, Suspense, useEffect, useState } from 'react';
import { FileDiffPane, FileList } from '@/components/changed-files';
import { CodeSearchForm } from '@/components/code-search-form';
import { CodeTree } from '@/components/code-tree';
import { CopyButton, CopyLinkButton } from '@/components/copy-link-button';
import { Markdown } from '@/components/markdown';
import { Empty, ErrorBox, QueryState } from '@/components/query-state';
import { QuickOpen } from '@/components/quick-open';
import { Button, buttonVariants } from '@/components/ui/button';
import { ViewChip } from '@/components/view-chip';
import { useProject } from '@/lib/api';
import {
  CODE_SEARCH_PAGE_SIZE,
  type CodeSearchParams,
  useBranchCompare,
  useBranches,
  useBranchFileDiff,
  useCodeFile,
  useCodeSearch,
} from '@/lib/code-api';
import { groupByFile, highlight } from '@/lib/code-search';
import { copyPathText, effectiveView, isMarkdownPath, resolveRelative } from '@/lib/code-view';
import { cn, formatSize } from '@/lib/utils';
import { CODE_SEARCH_MAX_MATCHES, CODE_SEARCH_QUERY_MAX } from '../../../server/code-types.ts';

const CodeViewer = lazy(() => import('@/components/code-viewer'));

const positiveInt = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : undefined;
};

export const parseCodeFileSearch = (search: Record<string, unknown>): { line?: number; view?: 'source' } => ({
  line: positiveInt(search.line),
  view: search.view === 'source' ? 'source' : undefined,
});

export const parseCodeSearch = (search: Record<string, unknown>): CodeSearchParams => ({
  q: typeof search.q === 'string' && search.q !== '' ? search.q.slice(0, CODE_SEARCH_QUERY_MAX) : undefined,
  case: search.case === true || search.case === 'true' || search.case === 1 ? true : undefined,
  offset: positiveInt(search.offset),
});

const nonEmpty = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

export interface CompareSearch {
  base?: string;
  head?: string;
  file?: string;
}

export const parseCompareSearch = (search: Record<string, unknown>): CompareSearch => ({
  base: nonEmpty(search.base),
  head: nonEmpty(search.head),
  file: nonEmpty(search.file),
});

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const QUICK_OPEN_KEY = isMac ? '⌘P' : 'Ctrl+P';

export function CodeLayout() {
  const { project } = useParams({ from: '/p/$project/code' });
  const { _splat: current } = useParams({ strict: false });
  const [quickOpen, setQuickOpen] = useState(false);
  const comparing = useMatch({ from: '/p/$project/code/compare', shouldThrow: false }) !== undefined;

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
    // Fills the window below the one-row header (h-12 plus its border) and main's py-4.
    <div className="flex h-[calc(100vh-5rem-1px)] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => setQuickOpen(true)}>
          Go to file
          <kbd className="font-mono text-xs text-muted-foreground">{QUICK_OPEN_KEY}</kbd>
        </Button>
        <Link
          to="/p/$project/code/compare"
          params={{ project }}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <GitCompareArrows aria-hidden />
          Compare
        </Link>
        <CodeSearchForm project={project} />
      </div>
      <div className={cn('grid min-h-96 flex-1 gap-3', comparing ? 'grid-cols-1' : 'grid-cols-[16rem_1fr]')}>
        {/* Hidden, not unmounted, so the tree keeps its open folders for the way back. */}
        <aside
          className={cn('overflow-auto rounded-md border p-1', comparing && 'hidden')}
          data-section="code-tree"
        >
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

export function CodeFilePage() {
  const { project, _splat: path = '' } = useParams({ from: '/p/$project/code/$' });
  const { line, view } = useSearch({ from: '/p/$project/code/$' });
  const navigate = useNavigate({ from: '/p/$project/code/$' });
  const query = useCodeFile(project, path);
  const repo = useProject(project).data?.repo;
  const mode = effectiveView(path, view, line);
  let body: ReactNode;
  if (query.isPending) body = <Empty>Loading...</Empty>;
  else if (query.isError) body = <ErrorBox error={query.error} />;
  else if (query.data.binary) body = <Empty>Binary file; not shown.</Empty>;
  else if (query.data.tooLarge || query.data.content === null) {
    body = <Empty>Too large to show ({formatSize(query.data.size)}).</Empty>;
  } else if (mode === 'rendered') {
    body = (
      <div className="h-full overflow-auto p-4">
        <Markdown
          text={query.data.content}
          project={project}
          renderLink={(href, children) => {
            const target = resolveRelative(path, href);
            return target ? (
              <Link to="/p/$project/code/$" params={{ project, _splat: target }}>
                {children}
              </Link>
            ) : null;
          }}
        />
      </div>
    );
  } else {
    body = (
      <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading editor...</p>}>
        <CodeViewer
          key={path}
          path={path}
          content={query.data.content}
          line={line}
          onLineClick={(n) => navigate({ search: (prev) => ({ ...prev, line: n }), replace: true })}
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
        {isMarkdownPath(path) && !simple && (
          // biome-ignore lint/a11y/useSemanticElements: a fieldset would add a border and legend we don't want here.
          <div role="group" aria-label="View" className="flex gap-1">
            <ViewChip
              label="Rendered"
              active={mode === 'rendered'}
              onClick={() => navigate({ search: (prev) => ({ ...prev, view: undefined, line: undefined }) })}
            />
            <ViewChip
              label="Source"
              active={mode === 'source'}
              onClick={() => navigate({ search: (prev) => ({ ...prev, view: 'source' }) })}
            />
          </div>
        )}
        <CopyButton
          label="Copy path"
          disabled={typeof repo !== 'string'}
          getText={() => (typeof repo === 'string' ? copyPathText(repo, path, line) : path)}
        />
        <CopyLinkButton />
      </div>
      <div className={cn('min-h-0 flex-1 overflow-hidden rounded-md border', simple && 'p-4')}>{body}</div>
    </div>
  );
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

function BranchSelect({
  label,
  value,
  branches,
  onChange,
}: {
  label: string;
  value: string | undefined;
  branches: string[];
  onChange: (branch: string) => void;
}) {
  // A branch named in the URL but gone from the repo still shows, so the error below makes sense.
  const options = value && !branches.includes(value) ? [value, ...branches] : branches;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 max-w-64 rounded-md border border-input bg-background px-2 font-mono text-sm"
      >
        {value === undefined && (
          <option value="" disabled>
            Pick a branch to compare
          </option>
        )}
        {options.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ComparePage() {
  const { project } = useParams({ from: '/p/$project/code/compare' });
  const search = useSearch({ from: '/p/$project/code/compare' });
  const navigate = useNavigate({ from: '/p/$project/code/compare' });
  const [sideBySide, setSideBySide] = useState(true);
  const branches = useBranches(project);
  const base = search.base ?? branches.data?.current ?? undefined;
  const { head } = search;
  const compare = useBranchCompare(project, base, head);
  const selected = search.file ?? compare.data?.files[0]?.path;
  const fileDiff = useBranchFileDiff(project, base, head, selected);
  // Base goes into the URL with any pick, so a copied link survives a change of the checked-out branch.
  const pick = (next: CompareSearch) => navigate({ search: { base, head, ...next, file: next.file } });

  let body: ReactNode;
  if (base === undefined || head === undefined) body = <Empty>Pick a branch to compare.</Empty>;
  else if (compare.isPending) body = <Empty>Loading...</Empty>;
  else if (compare.isError) body = <ErrorBox error={compare.error} />;
  else {
    const c = compare.data;
    body = (
      <>
        <p className="font-mono text-xs text-muted-foreground">
          merge-base {c.mergeBase.slice(0, 10)} · {c.head} {c.headCommit.slice(0, 10)}
        </p>
        {c.files.length === 0 ? (
          <Empty>No changes.</Empty>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[18rem_1fr] gap-3">
            <aside className="overflow-auto rounded-md border p-2" data-section="changed-files">
              <FileList files={c.files} selected={selected} onSelect={(file) => pick({ file })} />
            </aside>
            <section className="min-w-0 overflow-hidden rounded-md border" data-section="diff">
              <FileDiffPane query={fileDiff} sideBySide={sideBySide} />
            </section>
          </div>
        )}
      </>
    );
  }

  return (
    <QueryState query={branches}>
      {(list) => (
        <div className="flex h-full min-h-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <BranchSelect
              label="base"
              value={base}
              branches={list.branches}
              onChange={(b) => pick({ base: b })}
            />
            <BranchSelect
              label="head"
              value={head}
              branches={list.branches}
              onChange={(b) => pick({ head: b })}
            />
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setSideBySide((v) => !v)}>
              {sideBySide ? 'Inline view' : 'Side-by-side view'}
            </Button>
            <CopyLinkButton />
          </div>
          {body}
        </div>
      )}
    </QueryState>
  );
}
