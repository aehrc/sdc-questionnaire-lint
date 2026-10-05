import { describe, expect, it } from 'vitest';
import { runBinary } from '../support/cli.js';
import { expectValidReport } from '../support/report.js';

describe('no command', () => {
  it('prints short usage to stderr and exits 2', () => {
    expect(runBinary([])).toEqual({
      code: 2,
      stdout: '',
      stderr:
        'usage: sdc-lint <lint|explain> [options]\n' +
        'help: run sdc-lint --help for the available commands and flags\n',
    });
  });
});

describe('usage errors', () => {
  it.each([
    [
      ['lint', '--bogus'],
      'error: unknown flag --bogus\nhelp: run sdc-lint lint --help for the available flags\n',
    ],
    [
      ['explain', 'sdc/a', 'sdc/b'],
      'error: explain takes at most one rule ID, got 2\n' +
        'help: run sdc-lint explain --help for the available flags\n',
    ],
    [
      ['check'],
      'error: unknown command check\n' +
        'help: run sdc-lint --help for the available commands and flags\n',
    ],
  ])('%j prints error and help to stderr and exits 2', (argv, stderr) => {
    expect(runBinary(argv)).toEqual({ code: 2, stdout: '', stderr });
  });
});

describe('usage errors after a JSON format selection', () => {
  it('writes a failed document to stdout and the text failure to stderr', () => {
    const result = runBinary(['lint', '--format', 'json', '--bogus']);
    expect(result.code).toBe(2);
    expect(result.stderr).toBe(
      'error: unknown flag --bogus\nhelp: run sdc-lint lint --help for the available flags\n',
    );
    const document = expectValidReport(JSON.parse(result.stdout));
    expect(document).toEqual({
      schemaVersion: 1,
      status: 'failed',
      failure: {
        code: 'USAGE_ERROR',
        message: 'unknown flag --bogus',
        help: 'run sdc-lint lint --help for the available flags',
      },
    });
  });

  it('sees a format given before the command and before the invalid flag', () => {
    const result = runBinary(['--format=json', '--bogus', 'lint']);
    expect(result.code).toBe(2);
    expect(expectValidReport(JSON.parse(result.stdout))).toMatchObject({
      failure: { code: 'USAGE_ERROR' },
    });
  });

  it.each([
    [['lint', '--format', 'json', '--format', 'text']],
    [['lint', '--format', 'json', '--format', 'json']],
    [['lint', '--format', 'yaml']],
    [['lnt', '--format', 'json']],
    [['--format', 'json', '--bogus']],
  ])('%j leaves stdout empty', (argv) => {
    const result = runBinary(argv);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^error: /);
  });
});
