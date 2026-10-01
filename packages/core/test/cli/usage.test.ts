import { describe, expect, it } from 'vitest';
import { runBinary } from '../support/cli.js';

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
