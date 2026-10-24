import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { ProjectStore } from './projects.ts';
import { buildDir, clearState, hubPaths, hubPort, pluginVersion, readToken, writeState } from './state.ts';

// Started detached by the launcher, which passes the build hash and its folder in the environment.
const paths = hubPaths();
const token = readToken(paths);
if (!token) {
  console.error(`hub server: no token in ${paths.token}; start it with \`node hub/cli.ts open\`.`);
  process.exit(1);
}
const port = hubPort();
const build = process.env.TALK_FIRST_HUB_BUILD ?? '';
const version = pluginVersion();
const idleMs = Number(process.env.TALK_FIRST_HUB_IDLE_MS ?? 30 * 60 * 1000);

let lastActivity = Date.now();
const app = createApp({
  token,
  port: () => port,
  projects: new ProjectStore(paths),
  dist: process.env.TALK_FIRST_HUB_DIST ?? buildDir(paths, build),
  version,
  build,
  onActivity: () => {
    lastActivity = Date.now();
  },
});

const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, () => {
  writeState(paths, { pid: process.pid, port, version, build });
  console.log(`hub ${version} (${build}) listening on http://127.0.0.1:${port}`);
});
server.on('error', (err: NodeJS.ErrnoException) => {
  console.error(
    err.code === 'EADDRINUSE' ? `hub server: port ${port} is already in use.` : `hub server: ${err.message}`,
  );
  process.exit(1);
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
