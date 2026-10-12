import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from '../../src/cli/run.js';
import { expectValidReport } from './report.js';
import { expectValidSarif } from './sarif.js';

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

const binary = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));
const binDirectory = fileURLToPath(new URL('../../../../node_modules/.bin/', import.meta.url));

// Every JSON document a CLI test captures must be a valid report or SARIF log, so check it here
// once rather than in each test.
function checked(result: CliResult): CliResult {
  if (result.stdout.startsWith('{')) {
    const document = JSON.parse(result.stdout) as object;
    if ('runs' in document) expectValidSarif(document);
    else expectValidReport(document);
  }
  return result;
}

function fromSpawn(result: SpawnSyncReturns<string>): CliResult {
  if (result.error) throw result.error;
  if (result.status === null) throw new Error(`CLI terminated by signal ${String(result.signal)}`);
  return checked({ code: result.status, stdout: result.stdout, stderr: result.stderr });
}

// Large reports must arrive complete; spawnSync's default 1 MB buffer would cut them off.
const maxBuffer = 256 * 1024 * 1024;

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
  return checked({ code, stdout, stderr });
}

// Runs the built dist/cli.js; use for exit codes, stream separation and flushing.
export function runBinary(
  argv: readonly string[],
  options: { cwd?: string; env?: Record<string, string | undefined> } = {},
): CliResult {
  return fromSpawn(
    spawnSync(process.execPath, [binary, ...argv], {
      cwd: options.cwd ?? process.cwd(),
      // Inherit by default: Node on Windows fails to start without variables such as SystemRoot.
      env: options.env ?? process.env,
      encoding: 'utf8',
      maxBuffer,
    }),
  );
}

// Runs an installed executable from node_modules/.bin, as a user's shell would.
export function runExecutable(
  name: 'sdc-lint' | 'sdc-questionnaire-lint',
  argv: readonly string[],
  options: { cwd?: string } = {},
): CliResult {
  const windows = process.platform === 'win32';
  // npm installs .cmd shims on Windows, which only a shell can run.
  return fromSpawn(
    spawnSync(path.join(binDirectory, windows ? `${name}.cmd` : name), argv, {
      cwd: options.cwd ?? process.cwd(),
      env: process.env,
      encoding: 'utf8',
      maxBuffer,
      shell: windows,
    }),
  );
}

// Runs dist/cli.js with stdout piped into another process, as in sdc-lint lint | jq.
export function runPiped(argv: readonly string[], options: { cwd?: string } = {}): CliResult {
  const quote = (value: string): string => `"${value}"`;
  const consumer = `${quote(process.execPath)} -e "process.stdin.pipe(process.stdout)"`;
  const command = `${[process.execPath, binary, ...argv].map(quote).join(' ')} | ${consumer}`;
  return fromSpawn(
    spawnSync(command, {
      cwd: options.cwd ?? process.cwd(),
      env: process.env,
      encoding: 'utf8',
      maxBuffer,
      shell: true,
    }),
  );
}
