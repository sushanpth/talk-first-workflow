import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Fixture, makeFixture, transcriptsIn, write } from './fixtures.test-helper.ts';
import { memoryDump, memoryProjects, memoryStatus } from './memory.ts';

// Runs the real scripts/memory.py; the zod schemas inside these calls reject any shape drift.
describe('memory.py JSON contract', () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = makeFixture();
  });
  afterEach(() => rmSync(fx.tmp, { recursive: true, force: true }));

  it('lists projects with a .source file', async () => {
    expect(await memoryProjects()).toEqual([
      {
        name: 'shop',
        memory_dir: fx.memoryDir,
        repo: fx.repo,
        note_count: 2,
        brief_count: 1,
        transcript_dirs: [],
      },
    ]);
  });

  it('reports status for a repo', async () => {
    const status = await memoryStatus(fx.repo);
    expect(status).toMatchObject({ repo_root: fx.repo, is_git: true, memory_dir: fx.memoryDir });
    expect(status.transcript_dirs).toEqual([]);
  });

  it('lists transcript folders from every Claude config folder', async () => {
    const dirs = [join(fx.home, '.claude'), join(fx.home, '.claude-work')].map((h) =>
      transcriptsIn(h, fx.repo),
    );
    for (const dir of dirs) write(join(dir, 'session.jsonl'), '');
    write(join(fx.home, '.claude-empty', 'settings.json'), '{}');
    expect((await memoryStatus(fx.repo)).transcript_dirs).toEqual(dirs);
    expect((await memoryProjects())[0]?.transcript_dirs).toEqual(dirs);
  });

  it('dumps notes with links and backlinks, and briefs apart from notes', async () => {
    const dump = await memoryDump(fx.memoryDir);
    expect(dump.memory_dir).toBe(fx.memoryDir);
    expect(dump.index).toContain('[Auth]');
    const byName = Object.fromEntries(dump.notes.map((n) => [n.name, n]));
    expect(Object.keys(byName).sort()).toEqual(['auth', 'redis']);
    expect(byName.auth?.links).toEqual([{ target: 'redis', name: 'redis' }]);
    expect(byName.redis?.backlinks).toEqual(['auth']);
    expect(byName.auth?.type).toBe('project');
    expect(dump.briefs).toEqual([
      expect.objectContaining({
        file: '2026-10-23-login.md',
        title: 'Login page',
        path: join(fx.memoryDir, 'briefs', '2026-10-23-login.md'),
        links: [{ target: 'auth', name: 'auth' }],
      }),
    ]);
  });

  it('reuses the cached dump until a file changes', async () => {
    const first = await memoryDump(fx.memoryDir);
    expect(await memoryDump(fx.memoryDir)).toBe(first);
    write(
      join(fx.memoryDir, 'deploy.md'),
      '---\nname: deploy\ndescription: d\ntype: reference\n---\n\nFly.\n',
    );
    const second = await memoryDump(fx.memoryDir);
    expect(second).not.toBe(first);
    expect(second.notes.map((n) => n.name)).toContain('deploy');
  });
});
