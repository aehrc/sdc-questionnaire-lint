/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { describe, expect, it } from 'vitest';
import { type Format, type ParsedArgs, parseCliArgs } from '../../src/cli/args.js';

const lintHelp = 'run sdc-lint lint --help for the available flags';
const explainHelp = 'run sdc-lint explain --help for the available flags';
const topHelp = 'run sdc-lint --help for the available commands and flags';

function usage(message: string, help: string, failureFormat?: Format): ParsedArgs {
  return {
    kind: 'usage-error',
    message,
    help,
    ...(failureFormat === undefined ? {} : { failureFormat }),
  };
}

const cases: [string, string[], ParsedArgs][] = [
  // Commands
  ['no arguments', [], { kind: 'no-command' }],
  ['lint with defaults', ['lint'], { kind: 'lint', paths: [], format: 'text', showInfo: false }],
  [
    'lint with paths',
    ['lint', 'a.json', 'dir'],
    { kind: 'lint', paths: ['a.json', 'dir'], format: 'text', showInfo: false },
  ],
  [
    'lint with every flag',
    ['lint', '--config', 'c.json', '--format', 'json', '--show-info', 'a.json'],
    { kind: 'lint', paths: ['a.json'], configPath: 'c.json', format: 'json', showInfo: true },
  ],
  [
    'inline flag values',
    ['lint', '--config=c.json', '--format=json'],
    { kind: 'lint', paths: [], configPath: 'c.json', format: 'json', showInfo: false },
  ],
  ['explain listing', ['explain'], { kind: 'explain' }],
  ['explain one rule', ['explain', 'sdc/x'], { kind: 'explain', ruleId: 'sdc/x' }],
  [
    'explain with config',
    ['explain', '--config', 'c.mjs', 'sdc/x'],
    { kind: 'explain', ruleId: 'sdc/x', configPath: 'c.mjs' },
  ],

  // Option terminator
  [
    'paths after -- that start with -',
    ['lint', '--', '-odd.json', '--format'],
    { kind: 'lint', paths: ['-odd.json', '--format'], format: 'text', showInfo: false },
  ],
  [
    'paths before and after --',
    ['lint', 'a.json', '--', '-b.json'],
    { kind: 'lint', paths: ['a.json', '-b.json'], format: 'text', showInfo: false },
  ],
  ['explain rule after --', ['explain', '--', '-x'], { kind: 'explain', ruleId: '-x' }],

  // Flag placement
  [
    'common flag before the command',
    ['--config', 'c.json', 'lint'],
    { kind: 'lint', paths: [], configPath: 'c.json', format: 'text', showInfo: false },
  ],
  [
    'lint-only flags before the command',
    ['--format', 'json', '--show-info', 'lint'],
    { kind: 'lint', paths: [], format: 'json', showInfo: true },
  ],
  [
    'config before explain',
    ['--config', 'c.mjs', 'explain'],
    { kind: 'explain', configPath: 'c.mjs' },
  ],
  ['config without a command', ['--config', 'c.json'], { kind: 'no-command' }],

  // Repeated flags
  [
    'repeated --show-info',
    ['lint', '--show-info', '--show-info'],
    { kind: 'lint', paths: [], format: 'text', showInfo: true },
  ],
  [
    '--config twice',
    ['lint', '--config', 'a.json', '--config', 'b.json'],
    usage('--config was given more than once', lintHelp),
  ],
  [
    '--config twice, once before the command',
    ['--config', 'a.json', 'lint', '--config=b.json'],
    usage('--config was given more than once', lintHelp),
  ],
  [
    '--format twice',
    ['lint', '--format', 'json', '--format', 'text'],
    usage('--format was given more than once', lintHelp),
  ],
  [
    '--format twice with the same value',
    ['lint', '--format', 'json', '--format', 'json'],
    usage('--format was given more than once', lintHelp),
  ],

  // Help and version
  ['top-level help', ['--help'], { kind: 'help' }],
  ['lint help', ['lint', '--help'], { kind: 'help', command: 'lint' }],
  ['help before the command', ['--help', 'explain'], { kind: 'help', command: 'explain' }],
  ['top-level version', ['--version'], { kind: 'version' }],
  ['version after a command', ['explain', '--version'], { kind: 'version' }],
  ['help wins over version', ['--version', '--help'], { kind: 'help' }],
  [
    'help wins over an unknown flag',
    ['lint', '--bogus', '--help'],
    { kind: 'help', command: 'lint' },
  ],
  [
    'version wins over a bad format',
    ['lint', '--format', 'yaml', '--version'],
    { kind: 'version' },
  ],
  [
    'help wins over extra explain arguments',
    ['explain', 'a', 'b', '--help'],
    { kind: 'help', command: 'explain' },
  ],
  [
    'help wins over a missing value',
    ['lint', '--config', '--help'],
    { kind: 'help', command: 'lint' },
  ],
  ['unknown command wins over help', ['lnt', '--help'], usage('unknown command lnt', topHelp)],
  [
    'help after -- is a path',
    ['lint', '--', '--help'],
    { kind: 'lint', paths: ['--help'], format: 'text', showInfo: false },
  ],

  // Usage errors
  ['unknown command', ['check'], usage('unknown command check', topHelp)],
  ['unknown flag', ['lint', '--bogus'], usage('unknown flag --bogus', lintHelp)],
  ['unknown short flag', ['lint', '-x'], usage('unknown flag -x', lintHelp)],
  ['unknown flag without a command', ['--bogus'], usage('unknown flag --bogus', topHelp)],
  ['missing --config value', ['lint', '--config'], usage('--config requires a value', lintHelp)],
  [
    'flag in place of a --config value',
    ['lint', '--config', '--show-info'],
    usage('--config requires a value', lintHelp),
  ],
  [
    '-- in place of a --config value',
    ['lint', '--config', '--', 'a.json'],
    usage('--config requires a value', lintHelp),
  ],
  ['empty --config value', ['lint', '--config='], usage('--config requires a value', lintHelp)],
  ['missing --format value', ['lint', '--format'], usage('--format requires a value', lintHelp)],
  [
    'bad --format value',
    ['lint', '--format', 'yaml'],
    usage('--format must be text, json, github or sarif, not yaml', lintHelp),
  ],
  [
    'value on a boolean flag',
    ['lint', '--show-info=yes'],
    usage('--show-info does not take a value', lintHelp),
  ],
  [
    '--format with explain',
    ['explain', '--format', 'json'],
    usage('--format is not available for explain', explainHelp),
  ],
  [
    '--show-info with explain',
    ['explain', '--show-info'],
    usage('--show-info is not available for explain', explainHelp),
  ],
  [
    'two positionals for explain',
    ['explain', 'sdc/a', 'sdc/b'],
    usage('explain takes at most one rule ID, got 2', explainHelp),
  ],
  [
    'positional with no command',
    ['--', 'a.json'],
    usage('unexpected argument a.json; name a command first', topHelp),
  ],
  ...(['github', 'sarif'] as const).map((format): [string, string[], ParsedArgs] => [
    `lint --format=${format}`,
    ['lint', `--format=${format}`],
    { kind: 'lint', paths: [], format, showInfo: false },
  ]),
  // The format selection a failure document is written in
  ...(['json', 'github', 'sarif'] as const).map((format): [string, string[], ParsedArgs] => [
    `--format ${format} before an error`,
    ['lint', '--format', format, '--bogus'],
    usage('unknown flag --bogus', lintHelp, format),
  ]),
  [
    '--format text before an error',
    ['lint', '--format', 'text', '--bogus'],
    usage('unknown flag --bogus', lintHelp, 'text'),
  ],
  [
    'two --format selections before an error',
    ['lint', '--format', 'sarif', '--format', 'github'],
    usage('--format was given more than once', lintHelp),
  ],
  [
    '--format sarif with explain',
    ['explain', '--format', 'sarif'],
    usage('--format is not available for explain', explainHelp),
  ],
  [
    '--format sarif without a command',
    ['--format', 'sarif', '--bogus'],
    usage('unknown flag --bogus', topHelp),
  ],
];

describe('parseCliArgs', () => {
  it.each(cases)('%s', (_name, argv, expected) => {
    expect(parseCliArgs(argv)).toEqual(expected);
  });
});
