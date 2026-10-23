import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { ProjectStore } from './projects.ts';
import { clearState, hubPaths, writeState } from './state.ts';

// Started detached by the launcher, which passes the token and build hash in the environment.
const token = process.env.TALK_FIRST_HUB_TOKEN;
if (!token) {
  console.error('hub server: TALK_FIRST_HUB_TOKEN is not set; start it with `node hub/cli.ts open`.');
  process.exit(1);
}
const build = process.env.TALK_FIRST_HUB_BUILD ?? '';
const idleMs = Number(process.env.TALK_FIRST_HUB_IDLE_MS ?? 30 * 60 * 1000);
const paths = hubPaths();

let port = 0;
let lastActivity = Date.now();
const app = createApp({
  token,
  port: () => port,
  projects: new ProjectStore(paths),
  dist: process.env.TALK_FIRST_HUB_DIST ?? paths.dist,
  onActivity: () => {
    lastActivity = Date.now();
  },
});

const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 }, (info) => {
  port = info.port;
  writeState(paths, { pid: process.pid, port, token, build });
  console.log(`hub listening on http://127.0.0.1:${port}`);
});

function shutdown(reason: string): void {
  console.log(`hub stopping: ${reason}`);
  clearState(paths, process.pid);
  server.close();
  // Open keep-alive connections would hold the process; idle exit must not wait for them.
  setTimeout(() => process.exit(0), 1000).unref();
}

const timer = setInterval(
  () => {
    if (Date.now() - lastActivity > idleMs) {
      clearInterval(timer);
      shutdown('idle');
    }
  },
  Math.max(200, Math.min(60_000, idleMs / 4)),
);
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
