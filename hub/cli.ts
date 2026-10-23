// Plain JavaScript syntax on purpose: Node without type stripping must get this far to print the error.
const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(`hub: needs Node 22.18 or newer (found ${process.version}).`);
  process.exit(1);
}
import('./server/launcher.ts')
  .then(async (launcher) => {
    process.exitCode = await launcher.main(process.argv.slice(2));
  })
  .catch((err) => {
    console.error(`hub: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
