import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export function note(name: string, body: string, description = `About ${name}`): string {
  return `---\nname: ${name}\ndescription: ${description}\nmetadata:\n  type: project\n---\n\n${body}\n\n**Why:** test.\n`;
}

export function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
    },
  });
}

export interface Fixture {
  tmp: string;
  /** HOME for memory.py, so it never scans the real Claude config folders. */
  home: string;
  memoryRoot: string;
  memoryDir: string;
  repo: string;
}

/** Claude Code's transcripts folder for `repo` under a config folder. */
export const transcriptsIn = (claudeHome: string, repo: string): string =>
  join(claudeHome, 'projects', repo.replace(/[^A-Za-z0-9]/g, '-'));

/** A temp git repo "shop" with a memory folder holding two linked notes and a brief. */
export function makeFixture(): Fixture {
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'hub-test-')));
  const memoryRoot = join(tmp, 'memory');
  const repo = join(tmp, 'work', 'shop');
  const memoryDir = join(memoryRoot, 'shop');
  process.env.TALK_FIRST_MEMORY_ROOT = memoryRoot;
  process.env.CLAUDE_CONFIG_DIR = join(tmp, 'claude');
  process.env.TALK_FIRST_HUB_HOME = join(tmp, 'hub');
  const home = join(tmp, 'home');
  process.env.HOME = home;
  mkdirSync(home);
  mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q', '-b', 'main');
  write(join(repo, 'README.md'), '# Shop\n');
  write(join(repo, 'docs', 'guide.md'), '# Guide\n');
  write(join(repo, 'src', 'app.txt'), 'one\ntwo\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-qm', 'init');
  write(join(memoryDir, '.source'), `${repo}\n`);
  write(join(memoryDir, 'MEMORY.md'), '- [Auth](auth.md)\n');
  write(join(memoryDir, 'auth.md'), note('auth', 'Uses cookies. See [[redis]].'));
  write(join(memoryDir, 'redis.md'), note('redis', 'Key layout.'));
  write(join(memoryDir, 'briefs', '2026-10-23-login.md'), '# Brief: Login page\n\nGoal: [[auth]]\n');
  return { tmp, home, memoryRoot, memoryDir, repo };
}
