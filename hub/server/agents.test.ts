import { rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentRecords, briefPathFrom, transcriptsDir } from './agents.ts';
import { type Fixture, makeFixture, write } from './fixtures.test-helper.ts';

let fx: Fixture;
let dir: string;
beforeEach(() => {
  fx = makeFixture();
  dir = join(fx.tmp, 'transcripts');
});
afterEach(() => rmSync(fx.tmp, { recursive: true, force: true }));

const meta = (session: string, id: string, record: unknown, age = 0): string => {
  const path = join(dir, session, 'subagents', `agent-${id}.meta.json`);
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

    const records = await agentRecords(dir);
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
    expect((await agentRecords(join(fx.tmp, 'missing'))).size).toBe(0);
  });

  it('takes the transcripts dir from memory.py', async () => {
    const slug = fx.repo.replace(/[^A-Za-z0-9]/g, '-');
    expect(await transcriptsDir(fx.repo)).toBe(join(fx.tmp, 'claude', 'projects', slug));
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
