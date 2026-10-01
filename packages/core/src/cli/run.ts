import pkg from '../../package.json' with { type: 'json' };
import { LintFailure, renderFailureJson, renderFailureText } from '../failure.js';
import { parseCliArgs } from './args.js';

export interface CliIo {
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  stdout: { write(chunk: string): void; isTTY?: boolean };
  stderr: { write(chunk: string): void };
}

const shortUsage =
  'usage: sdc-lint <lint|explain> [options]\n' +
  'help: run sdc-lint --help for the available commands and flags\n';

export function runCli(argv: readonly string[], io: CliIo): Promise<0 | 1 | 2> {
  const args = parseCliArgs(argv);
  switch (args.kind) {
    case 'version':
      io.stdout.write(`${pkg.version}\n`);
      return Promise.resolve(0);
    case 'usage-error': {
      const failure = new LintFailure({
        code: 'USAGE_ERROR',
        message: args.message,
        help: args.help,
      });
      // Once lint --format json is recognised, automation reads the failure from stdout too.
      if (args.jsonFormat) io.stdout.write(renderFailureJson(failure));
      io.stderr.write(renderFailureText(failure));
      return Promise.resolve(2);
    }
    // help, lint and explain print short usage until they are implemented.
    case 'no-command':
    case 'help':
    case 'lint':
    case 'explain':
      io.stderr.write(shortUsage);
      return Promise.resolve(2);
  }
}
