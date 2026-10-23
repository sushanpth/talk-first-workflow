import { execFile } from 'node:child_process';

export class RunError extends Error {
  readonly code: number | string | null;
  readonly stderr: string;

  constructor(command: string, code: number | string | null, stderr: string) {
    super(`${command} failed${code === null ? '' : ` (${code})`}: ${stderr.trim().split('\n')[0] ?? ''}`);
    this.code = code;
    this.stderr = stderr;
  }
}

const MAX_BUFFER = 64 * 1024 * 1024;

/** Runs a program with an argument array (never a shell) and returns its stdout as bytes. */
export function runBuffer(file: string, args: string[], cwd?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { cwd, encoding: 'buffer', maxBuffer: MAX_BUFFER, timeout: 30_000 },
      (error, stdout, stderr) => {
        if (error) {
          const code = (error as NodeJS.ErrnoException).code ?? null;
          reject(new RunError(`${file} ${args[0] ?? ''}`, code, stderr.toString()));
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

export async function run(file: string, args: string[], cwd?: string): Promise<string> {
  return (await runBuffer(file, args, cwd)).toString('utf8');
}
