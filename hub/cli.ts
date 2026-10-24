// Plain JavaScript syntax on purpose: Node without type stripping must get this far to print the error.
const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(`hub: needs Node 22.18 or newer (found ${process.version}).`);
  process.exit(1);
}
// The launcher itself imports hono and zod, so a fresh plugin install needs its packages first.
const { existsSync } = require('node:fs');
const { join } = require('node:path');
if (!existsSync(join(__dirname, 'node_modules', '.modules.yaml'))) {
  console.error('hub: installing packages (first run)...');
  const install = require('node:child_process').spawnSync(
    'pnpm',
    ['install', '--frozen-lockfile', '--config.confirmModulesPurge=false'],
    { cwd: __dirname, stdio: ['ignore', 2, 2] },
  );
  if (install.error || install.status !== 0) {
    console.error(
      install.error?.code === 'ENOENT'
        ? 'hub: pnpm is not installed; install it (https://pnpm.io/installation) and retry.'
        : `hub: pnpm install failed (exit ${install.status}).`,
    );
    process.exit(1);
  }
}
import('./server/launcher.ts')
  .then(async (launcher) => {
    process.exitCode = await launcher.main(process.argv.slice(2));
  })
  .catch((err) => {
    console.error(`hub: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
