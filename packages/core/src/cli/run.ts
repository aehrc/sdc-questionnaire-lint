/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import pkg from '../../package.json' with { type: 'json' };
import {
  asLintFailure,
  LintFailure,
  type OutputFormat,
  renderFailureOutput,
  renderFailureText,
} from '../failure.js';
import { type LintRun, lintWithRules } from '../lint.js';
import { formatGithubReport, formatGithubSummary } from '../report/github.js';
import { formatJsonReport } from '../report/json.js';
import { formatSarifReport } from '../report/sarif.js';
import { formatTextReport } from '../report/text.js';
import { type ParsedArgs, parseCliArgs } from './args.js';
import { colourEnabled } from './colour.js';
import { runExplain } from './explain.js';
import { helpText } from './help.js';
import { guardStdout } from './output-guard.js';
import { appendStepSummary } from './step-summary.js';

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

type LintArgs = Extract<ParsedArgs, { kind: 'lint' }>;

// The completed run in the selected format. Only github has a job summary as well.
function writeReport({ report, rules }: LintRun, args: LintArgs, io: CliIo): void {
  switch (args.format) {
    case 'text':
      io.stdout.write(
        formatTextReport(report, { showInfo: args.showInfo, colour: colourEnabled(io) }),
      );
      return;
    case 'json':
      io.stdout.write(formatJsonReport(report));
      return;
    case 'github':
      // stdout first, so a summary that cannot be written loses no findings.
      io.stdout.write(formatGithubReport(report));
      appendStepSummary(io, formatGithubSummary(report));
      return;
    case 'sarif':
      io.stdout.write(formatSarifReport(report, rules, io.cwd));
      return;
  }
}

// A failure's document on stdout, and job summary, in the selected format; then the text failure
// on stderr, in every format.
function writeFailure(failure: LintFailure, format: OutputFormat | undefined, io: CliIo): void {
  if (format !== undefined) {
    const { stdout, summary } = renderFailureOutput(format, failure, io.cwd);
    if (stdout !== undefined) io.stdout.write(stdout);
    if (summary !== undefined) appendStepSummary(io, summary);
  }
  io.stderr.write(renderFailureText(failure));
}

// Buffers the whole report and writes it once; a failure discards partial results.
async function runLint(args: LintArgs, io: CliIo): Promise<0 | 1 | 2> {
  try {
    let run: LintRun;
    // The run executes config and plugin code, whose output goes to stderr. The report goes through
    // io.stdout, which the guard never patches. The binary keeps its own guard on for the whole
    // process; this one covers in-process callers.
    const restore = guardStdout(io.stderr);
    try {
      run = await lintWithRules({
        cwd: io.cwd,
        paths: args.paths,
        ...(args.configPath === undefined ? {} : { configPath: args.configPath }),
      });
    } finally {
      restore();
    }
    writeReport(run, args, io);
    return run.report.summary.errors > 0 ? 1 : 0;
  } catch (error) {
    writeFailure(asLintFailure(error), args.format, io);
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
      // Once lint --format is recognised, automation reads the failure from stdout too.
      writeFailure(failure, args.failureFormat, io);
      return 2;
    }
    case 'help':
      io.stdout.write(helpText(args.command));
      return 0;
    case 'lint':
      return runLint(args, io);
    case 'explain':
      return runExplain(args, io);
    case 'no-command':
      io.stderr.write(shortUsage);
      return 2;
  }
}
