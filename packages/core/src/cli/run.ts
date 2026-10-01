import pkg from '../../package.json' with { type: 'json' };
import { describeError, LintFailure, renderFailureJson, renderFailureText } from '../failure.js';
import { lint } from '../lint.js';
import { formatJsonReport } from '../report/json.js';
import { formatTextReport } from '../report/text.js';
import { type ParsedArgs, parseCliArgs } from './args.js';
import { colourEnabled } from './colour.js';
import { helpText } from './help.js';
import { guardStdout } from './output-guard.js';

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
  // Capture the real writer first: the guard redirects process.stdout.write to stderr.
  const stdout = { write: io.stdout.write.bind(io.stdout), ...pickTTY(io.stdout) };
  const restore = guardStdout(io.stderr);
  return Promise.resolve()
    .then(() => execute(argv, { ...io, stdout }))
    .finally(restore);
}

function pickTTY(stdout: CliIo['stdout']): { isTTY?: boolean } {
  return stdout.isTTY === undefined ? {} : { isTTY: stdout.isTTY };
}

// Buffers the whole report and writes it once; a failure discards partial results.
async function runLint(args: Extract<ParsedArgs, { kind: 'lint' }>, io: CliIo): Promise<0 | 1 | 2> {
  try {
    const report = await lint({
      cwd: io.cwd,
      paths: args.paths,
      ...(args.configPath === undefined ? {} : { configPath: args.configPath }),
    });
    io.stdout.write(
      args.format === 'json'
        ? formatJsonReport(report)
        : formatTextReport(report, { showInfo: args.showInfo, colour: colourEnabled(io) }),
    );
    return report.summary.errors > 0 ? 1 : 0;
  } catch (error) {
    const failure =
      error instanceof LintFailure
        ? error
        : new LintFailure({
            code: 'INTERNAL_ERROR',
            message: `unexpected error: ${describeError(error)}`,
            help: 'this is a bug in sdc-questionnaire-lint; report it with the command you ran',
          });
    if (args.format === 'json') io.stdout.write(renderFailureJson(failure));
    io.stderr.write(renderFailureText(failure));
    return 2;
  }
}

async function execute(argv: readonly string[], io: CliIo): Promise<0 | 1 | 2> {
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
      return runLint(args, io);
    // explain prints short usage until it is implemented.
    case 'no-command':
    case 'explain':
      io.stderr.write(shortUsage);
      return 2;
  }
}
