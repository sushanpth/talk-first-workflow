import { rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentRecords, briefPathFrom, labelWorktrees } from './agents.ts';
import { type Fixture, makeFixture, write } from './fixtures.test-helper.ts';
import type { Project } from './types.ts';

let fx: Fixture;
let dir: string;
beforeEach(() => {
  fx = makeFixture();
  dir = join(fx.tmp, 'transcripts');
});
afterEach(() => rmSync(fx.tmp, { recursive: true, force: true }));

const meta = (session: string, id: string, record: unknown, age = 0, base = dir): string => {
  const path = join(base, session, 'subagents', `agent-${id}.meta.json`);
  write(path, typeof record === 'string' ? record : JSON.stringify(record));
  const when = Date.now() / 1000 - age;
  utimesSync(path, when, when);
  return path;
};

describe('agent records', () => {
  it('finds the newest record for a worktree and skips others and bad files', async () => {
    const wt = join(fx.repo, '.claude', 'worktrees', 'agent-b');
    meta('s1', 'a', { agentType: 'implementer', description: 'Old task', worktreePath: wt }, 600);
    meta('s2', 'b', { agentType: 'implementer', description: 'Track hub: Login', worktreePath: wt }, 60);
    meta('s2', 'c', { agentType: 'implementer', description: 'Other', worktreePath: '/elsewhere' });
    meta('s2', 'r', { agentType: 'review-lint', description: 'Lint review' });
    meta('s2', 'bad', '{not json');
    meta('s2', 'odd', { agentType: 7, description: null, worktreePath: join(fx.tmp, 'odd') });

    const records = await agentRecords([dir]);
    expect(records.get(wt)).toEqual({
      agentId: 'b',
      agentType: 'implementer',
      task: 'Track hub: Login',
      transcript: join(dir, 's2', 'subagents', 'agent-b.jsonl'),
    });
    expect(records.get(join(fx.tmp, 'odd'))).toMatchObject({ agentId: 'odd', agentType: null, task: null });
    expect([...records.keys()].sort()).toEqual(['/elsewhere', join(fx.tmp, 'odd'), wt].sort());
  });

  it('returns nothing for a missing transcripts dir', async () => {
    expect((await agentRecords([join(fx.tmp, 'missing')])).size).toBe(0);
    expect((await agentRecords([])).size).toBe(0);
  });

  it('merges records from several transcript folders, the newest per worktree winning', async () => {
    const other = join(fx.tmp, 'transcripts-work');
    const one = join(fx.repo, '.claude', 'worktrees', 'agent-1');
    const two = join(fx.repo, '.claude', 'worktrees', 'agent-2');
    meta('s1', 'old1', { description: 'Old one', worktreePath: one }, 600);
    meta('s1', 'new2', { description: 'New two', worktreePath: two }, 60);
    meta('s9', 'new1', { description: 'New one', worktreePath: one }, 60, other);
    meta('s9', 'old2', { description: 'Old two', worktreePath: two }, 600, other);

    const records = await agentRecords([dir, join(fx.tmp, 'missing'), other]);
    expect(records.get(one)).toMatchObject({ agentId: 'new1', task: 'New one' });
    expect(records.get(one)?.transcript).toBe(join(other, 's9', 'subagents', 'agent-new1.jsonl'));
    expect(records.get(two)).toMatchObject({ agentId: 'new2', task: 'New two' });

    const project: Project = {
      id: 'shop',
      name: 'shop',
      repo: fx.repo,
      memoryDir: fx.memoryDir,
      noteCount: 0,
      briefCount: 0,
      transcriptDirs: [dir, other],
    };
    const trees = [one, two].map((path) => ({ name: path, path, branch: null, head: 'abc' }));
    expect((await labelWorktrees(project, trees)).map((t) => t.task)).toEqual(['New one', 'New two']);
  });
});

describe('brief path from a transcript', () => {
  const brief = () => join(fx.memoryDir, 'briefs', '2026-10-23-login.md');
  const transcript = (...lines: unknown[]): string => {
    const path = join(dir, 's1', 'subagents', 'agent-a.jsonl');
    write(path, `${lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n')}\n`);
    return path;
  };
  const prompt = (content: unknown) => ({ type: 'user', message: { role: 'user', content } });

  it('reads a brief path from the first prompt, as text or content blocks', async () => {
    const text = transcript(prompt(`Brief: ${brief()}\nMemory to read: none`));
    expect(await briefPathFrom(text, fx.memoryDir)).toBe(brief());
    const blocks = transcript(prompt([{ type: 'text', text: `See ${brief()}.` }]));
    expect(await briefPathFrom(blocks, fx.memoryDir)).toBe(brief());
  });

  it('ignores missing briefs, briefs outside the memory folder and later lines', async () => {
    const outside = join(fx.tmp, 'other', 'briefs', 'x.md');
    write(outside, '# Brief: x\n');
    const missing = join(fx.memoryDir, 'briefs', 'nope.md');
    expect(await briefPathFrom(transcript(prompt(`${missing} ${outside}`)), fx.memoryDir)).toBeNull();
    expect(await briefPathFrom(transcript(prompt('no brief'), prompt(brief())), fx.memoryDir)).toBeNull();
    expect(await briefPathFrom(transcript('{bad', prompt(brief())), fx.memoryDir)).toBeNull();
    expect(await briefPathFrom(join(fx.tmp, 'none.jsonl'), fx.memoryDir)).toBeNull();
  });

  it('caps how much of the first line it reads', async () => {
    const long = transcript(prompt(`Brief: ${brief()}\n${'x'.repeat(200_000)}`));
    expect(await briefPathFrom(long, fx.memoryDir)).toBe(brief());
    const late = transcript(prompt(`${'x'.repeat(200_000)} ${brief()}`));
    expect(await briefPathFrom(late, fx.memoryDir)).toBeNull();
  });
});
