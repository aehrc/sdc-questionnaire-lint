import { LintFailure } from '../failure.js';
import { toPointer } from '../json-pointer.js';
import { isObject } from '../object.js';
import type { LintConfig } from './types.js';

type Path = readonly (string | number)[];

// Only keys that do something: one accepted and ignored would let an author believe it is in effect.
const knownKeys = ['files', 'rules', 'source'];
const ruleSettings = ['error', 'warning', 'info', 'off'];

// CONFIG_INVALID naming the config file and the JSON Pointer of the entry.
export function configInvalid(
  display: string,
  at: Path,
  problem: string,
  help: string,
): LintFailure {
  const where = at.length === 0 ? 'the top level' : toPointer(at);
  return new LintFailure({
    code: 'CONFIG_INVALID',
    path: display,
    message: `config ${display} is invalid at ${where}: ${problem}`,
    help,
  });
}

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value === 'object' ? 'an object' : `a ${typeof value}`;
}

// Checks the config's shape. Rule IDs are checked by the registry, which knows them.
export function validateConfig(raw: unknown, display: string): LintConfig {
  const fail = (at: Path, problem: string, help: string): never => {
    throw configInvalid(display, at, problem, help);
  };
  const expectObject = (value: unknown, at: Path): Record<string, unknown> =>
    isObject(value)
      ? value
      : fail(
          at,
          `expected an object, got ${describeValue(value)}`,
          'see docs/cli.md for the config format',
        );
  const expectStrings = (value: unknown, at: Path, what: string): void => {
    if (!Array.isArray(value)) {
      fail(
        at,
        `expected an array of strings, got ${describeValue(value)}`,
        `list the ${what} as an array of strings`,
      );
      return;
    }
    value.forEach((entry: unknown, index) => {
      if (typeof entry !== 'string' || entry === '') {
        fail(
          [...at, index],
          `expected a non-empty string, got ${describeValue(entry)}`,
          `list the ${what} as strings`,
        );
      }
    });
  };

  const config = isObject(raw)
    ? raw
    : fail(
        [],
        `expected a config object, got ${describeValue(raw)}`,
        'make the file a JSON object, such as { "files": ["fsh-generated/resources"] }',
      );

  for (const key of Object.keys(config)) {
    if (!knownKeys.includes(key)) {
      fail([key], `unknown key ${key}`, `the known keys are ${knownKeys.join(', ')}`);
    }
  }

  if (config.files !== undefined) {
    if (Array.isArray(config.files) && config.files.length === 0) {
      fail(
        ['files'],
        'files is empty',
        'list at least one file, directory or glob, or remove files to lint fsh-generated/resources',
      );
    }
    expectStrings(config.files, ['files'], 'input files, directories or globs');
  }

  if (config.source !== undefined) {
    const source = expectObject(config.source, ['source']);
    for (const key of Object.keys(source)) {
      if (key !== 'fsh') fail(['source', key], `unknown key ${key}`, 'the only source key is fsh');
    }
    // [] is allowed: it omits FSH source lookup.
    if (source.fsh !== undefined) expectStrings(source.fsh, ['source', 'fsh'], 'FSH directories');
  }

  if (config.rules !== undefined) {
    const rules = expectObject(config.rules, ['rules']);
    for (const [ruleId, setting] of Object.entries(rules)) {
      if (typeof setting !== 'string' || !ruleSettings.includes(setting)) {
        fail(
          ['rules', ruleId],
          `${typeof setting === 'string' ? JSON.stringify(setting) : describeValue(setting)} is not a rule setting`,
          'set the rule to error, warning, info or off',
        );
      }
    }
  }

  return config;
}
