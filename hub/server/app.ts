import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative } from 'node:path';
import { type ErrorHandler, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  changedFiles,
  defaultBase,
  fileAtCommit,
  fileOnDisk,
  listWorktrees,
  resolveCommit,
  trackedMarkdown,
} from './git.ts';
import { memoryDump, memoryStatus } from './memory.ts';
import { realInside } from './paths.ts';
import type { ProjectStore } from './projects.ts';
import { guard, requireAuth } from './security.ts';
import type { FileDiff, MemoryOverview, PlanSummary, Project, Worktree, WorktreeDiff } from './types.ts';

export interface AppOptions {
  token: string;
  port: () => number;
  projects: ProjectStore;
  dist: string;
  onActivity?: () => void;
}

const fail = (status: 403 | 404 | 400, message: string): never => {
  throw new HTTPException(status, { message });
};

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

// Monaco sets inline styles; images in docs may come from the web.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; " +
  "font-src 'self' data:; worker-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'";

export function createApp(options: AppOptions): Hono {
  const { projects } = options;
  const app = new Hono();
  // Every API route lives on this sub-app, behind its auth middleware: deny by default.
  const api = new Hono();

  app.use(guard({ token: options.token, port: options.port }));
  api.use(requireAuth(options.token, options.onActivity));

  const onError: ErrorHandler = (err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    return c.json({ error: err.message }, 500);
  };
  app.onError(onError);
  api.onError(onError);

  const project = async (id: string): Promise<Project> =>
    (await projects.get(id)) ?? fail(404, 'no such project');
  const repoOf = (p: Project): string => p.repo ?? fail(404, 'this project has no repo on disk');
  const dump = async (id: string) => memoryDump((await project(id)).memoryDir);

  const worktree = async (id: string, name: string): Promise<{ repo: string; tree: Worktree }> => {
    const repo = repoOf(await project(id));
    const tree = (await listWorktrees(repo)).find((w) => w.name === name) ?? fail(404, 'no such worktree');
    if (!(await realInside(await projects.roots(), tree.path)))
      fail(403, 'worktree is outside the allowed roots');
    return { repo, tree };
  };

  const baseFor = async (repo: string, tree: Worktree, ref: string | undefined): Promise<string> => {
    if (!ref) return defaultBase(repo, tree.path);
    return (await resolveCommit(tree.path, ref)) ?? fail(400, 'unknown base commit');
  };

  api.get('/health', (c) => c.json({ ok: true, pid: process.pid }));

  api.get('/projects', async (c) => c.json(await projects.list()));

  api.get('/projects/:id', async (c) => c.json(await project(c.req.param('id'))));

  api.get('/projects/:id/plans', async (c) => {
    const { briefs } = await dump(c.req.param('id'));
    return c.json(briefs.map(({ file, title, path }): PlanSummary => ({ file, title, path })));
  });

  api.get('/projects/:id/plans/:file', async (c) => {
    const { briefs } = await dump(c.req.param('id'));
    return c.json(briefs.find((b) => b.file === c.req.param('file')) ?? fail(404, 'no such plan'));
  });

  api.get('/projects/:id/memory', async (c) => {
    const data = await dump(c.req.param('id'));
    const overview: MemoryOverview = {
      memoryDir: data.memory_dir,
      index: data.index,
      notes: data.notes.map(({ name, description, type, path }) => ({ name, description, type, path })),
    };
    return c.json(overview);
  });

  api.get('/projects/:id/memory/:note', async (c) => {
    const { notes } = await dump(c.req.param('id'));
    return c.json(notes.find((n) => n.name === c.req.param('note')) ?? fail(404, 'no such note'));
  });

  api.get('/projects/:id/docs', async (c) => {
    return c.json(await trackedMarkdown(repoOf(await project(c.req.param('id')))));
  });

  api.get('/projects/:id/doc', async (c) => {
    const repo = repoOf(await project(c.req.param('id')));
    const path = c.req.query('path') ?? fail(400, 'path is required');
    if (!(await trackedMarkdown(repo)).includes(path)) fail(404, 'not a tracked markdown file');
    const file = (await fileOnDisk(repo, path)) ?? fail(403, 'path is outside the repo');
    return c.json({ path, text: file.text });
  });

  api.get('/projects/:id/worktrees', async (c) => {
    return c.json(await listWorktrees(repoOf(await project(c.req.param('id')))));
  });

  api.get('/projects/:id/worktrees/:name', async (c) => {
    const { repo, tree } = await worktree(c.req.param('id'), c.req.param('name'));
    const base = await baseFor(repo, tree, c.req.query('base'));
    const result: WorktreeDiff = { ...tree, base, files: await changedFiles(tree.path, base) };
    return c.json(result);
  });

  api.get('/projects/:id/worktrees/:name/file', async (c) => {
    const { repo, tree } = await worktree(c.req.param('id'), c.req.param('name'));
    const base = await baseFor(repo, tree, c.req.query('base'));
    const path = c.req.query('path') ?? fail(400, 'path is required');
    const change =
      (await changedFiles(tree.path, base)).find((f) => f.path === path) ?? fail(404, 'file not changed');
    const before =
      change.status === 'A' || change.status === '?'
        ? { text: '', binary: false }
        : await fileAtCommit(tree.path, base, change.oldPath ?? change.path);
    const after =
      change.status === 'D'
        ? { text: '', binary: false }
        : ((await fileOnDisk(tree.path, change.path)) ?? fail(403, 'path is outside the worktree'));
    const result: FileDiff = {
      ...change,
      original: before.text,
      modified: after.text,
      binary: before.binary || after.binary,
    };
    return c.json(result);
  });

  // Maps a file the launcher was asked to open to its page in the UI.
  api.get('/resolve', async (c) => {
    const kind = c.req.query('kind');
    const target = c.req.query('path') ?? '';
    const list = await projects.list();
    const enc = encodeURIComponent;
    if (kind === 'project' || kind === 'doc') {
      const repo = c.req.query('repo') ?? fail(400, 'repo is required');
      const root = await memoryStatus(repo).catch(() => fail(404, 'not a project'));
      const p = list.find((x) => x.memoryDir === root.memory_dir) ?? fail(404, 'project not registered');
      if (kind === 'project') return c.json({ url: `/p/${enc(p.id)}/plans` });
      const rel = isAbsolute(target) ? relative(root.repo_root, target) : target;
      if (!(await trackedMarkdown(repoOf(p))).includes(rel)) fail(404, 'not a tracked markdown file');
      return c.json({ url: `/p/${enc(p.id)}/docs/${rel.split('/').map(enc).join('/')}` });
    }
    if (kind === 'plan' || kind === 'note') {
      const real =
        (await realInside(await projects.roots(), target)) ??
        fail(404, 'file is not in a known memory folder');
      for (const p of list) {
        const data = await memoryDump(p.memoryDir);
        const items = kind === 'plan' ? data.briefs : data.notes;
        const found = items.find((item) => item.path === real || item.path === target);
        if (found && 'file' in found) return c.json({ url: `/p/${enc(p.id)}/plans/${enc(found.file)}` });
        if (found) return c.json({ url: `/p/${enc(p.id)}/memory/${enc(found.name)}` });
      }
      return fail(404, `not a ${kind} in a known memory folder`);
    }
    if (kind === 'worktree') {
      const real =
        (await realInside(await projects.roots(), target)) ?? fail(404, 'worktree is not in a known repo');
      for (const p of list) {
        if (!p.repo) continue;
        const tree = (await listWorktrees(p.repo)).find((w) => w.path === real || w.path === target);
        if (!tree) continue;
        const base = c.req.query('base');
        const sha = base ? ((await resolveCommit(tree.path, base)) ?? fail(400, 'unknown base commit')) : '';
        return c.json({ url: `/p/${enc(p.id)}/worktrees/${enc(tree.name)}${sha ? `?base=${sha}` : ''}` });
      }
      return fail(404, 'not a linked worktree of a known repo');
    }
    return fail(400, 'kind must be project, plan, note, doc or worktree');
  });

  api.all('*', (c) => c.json({ error: 'not found' }, 404));
  app.route('/api', api);

  app.get('*', async (c) => {
    let path = '';
    try {
      path = decodeURIComponent(new URL(c.req.url).pathname);
    } catch {
      return c.text('bad path', 400);
    }
    const asset = await realInside([options.dist], join(options.dist, path));
    if (asset && (await stat(asset)).isFile()) {
      const type = MIME[extname(asset)] ?? 'application/octet-stream';
      const headers: Record<string, string> = { 'Content-Type': type };
      if (dirname(asset).endsWith('/assets'))
        headers['Cache-Control'] = 'public, max-age=31536000, immutable';
      if (type.startsWith('text/html')) headers['Content-Security-Policy'] = CSP;
      return c.body(await readFile(asset), 200, headers);
    }
    if (path.startsWith('/assets/')) return c.text('not found', 404);
    const index = await readFile(join(options.dist, 'index.html')).catch(() => null);
    if (!index) return c.text('The hub is not built yet. Run `node hub/cli.ts open`.', 503);
    return c.body(index, 200, { 'Content-Type': MIME['.html'] ?? '', 'Content-Security-Policy': CSP });
  });

  return app;
}
