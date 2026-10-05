import pkg from '../../package.json' with { type: 'json' };
import { LintFailure, renderFailureJson, renderFailureText } from '../failure.js';
import { parseCliArgs } from './args.js';
import { helpText } from './help.js';

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
  return Promise.resolve().then(() => execute(argv, io));
}

function execute(argv: readonly string[], io: CliIo): 0 | 1 | 2 {
  const args = parseCliArgs(argv);
  switch (args.kind) {
    case 'version':
      io.stdout.write(`${pkg.version}\n`);
      return 0;
    case 'usage-error': {
      const failure = new LintFailure({
        code: 'USAGE_ERROR',
        message: args.message,
        help: args.help,
      });
      // Once lint --format json is recognised, automation reads the failure from stdout too.
      if (args.jsonFormat) io.stdout.write(renderFailureJson(failure));
      io.stderr.write(renderFailureText(failure));
      return 2;
    }
    case 'help':
      io.stdout.write(helpText(args.command));
      return 0;
    case 'lint':
    case 'explain': {
      const failure = new LintFailure({
        code: 'USAGE_ERROR',
        message: `sdc-lint ${args.kind} is not implemented yet`,
        help: 'run sdc-lint --help for the available commands and flags',
      });
      if (args.kind === 'lint' && args.format === 'json')
        io.stdout.write(renderFailureJson(failure));
      io.stderr.write(renderFailureText(failure));
      return 2;
    }
    case 'no-command':
      io.stderr.write(shortUsage);
      return 2;
  }
}
