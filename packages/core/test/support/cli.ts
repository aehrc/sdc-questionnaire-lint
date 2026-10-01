import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runCli } from '../../src/cli/run.js';

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

const binary = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));

// Runs the CLI in this process with recorded streams; use for TTY cases and large tables.
export async function runInProcess(
  argv: readonly string[],
  options: { cwd?: string; env?: Record<string, string | undefined>; isTTY?: boolean } = {},
): Promise<CliResult> {
  let stdout = '';
  let stderr = '';
  const code = await runCli(argv, {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? {},
    stdout: {
      write: (chunk) => {
        stdout += chunk;
      },
      isTTY: options.isTTY ?? false,
    },
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      },
    },
  });
  return { code, stdout, stderr };
}

// Runs the built dist/cli.js; use for exit codes, stream separation and flushing.
export function runBinary(
  argv: readonly string[],
  options: { cwd?: string; env?: Record<string, string | undefined> } = {},
): CliResult {
  const result = spawnSync(process.execPath, [binary, ...argv], {
    cwd: options.cwd ?? process.cwd(),
    // Inherit by default: Node on Windows fails to start without variables such as SystemRoot.
    env: options.env ?? process.env,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status === null) throw new Error(`CLI terminated by signal ${String(result.signal)}`);
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}
