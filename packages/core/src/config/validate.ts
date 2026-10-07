import { LintFailure } from '../failure.js';
import { jsonPointerPattern, toPointer } from '../json-pointer.js';
import { isObject } from '../object.js';
import type { LintConfig } from './types.js';

type Path = readonly (string | number)[];

export type ConfigFormat = 'json' | 'mjs';

// Only keys that do something: one accepted and ignored would let an author believe it is in effect.
const knownKeys = ['files', 'plugins', 'rules', 'source', 'suppress'];
const ruleSettings = ['error', 'warning', 'info', 'off'];
const requiredSuppressionKeys = ['rule', 'reason', 'file'];
const selectorKeys = ['linkId', 'extensionUrl', 'name', 'resource', 'pointer'];
const requiredHelp: Record<string, string> = {
  rule: 'set rule to the ID of the rule whose findings to hide',
  reason: 'set reason to why the findings are acceptable here',
  file: "set file to the input file, relative to the config's directory",
};

// CONFIG_INVALID naming the config file and the JSON Pointer of the entry.
export function invalidConfigFailure(
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

// Checks the config's shape. Rule IDs and plugins are checked by the rule set, which knows them.
export function validateConfig(
  raw: unknown,
  { display, format }: { display: string; format: ConfigFormat },
): LintConfig {
  const fail = (at: Path, problem: string, help: string): never => {
    throw invalidConfigFailure(display, at, problem, help);
  };
  const expectObject = (value: unknown, at: Path, example: string): Record<string, unknown> =>
    isObject(value)
      ? value
      : fail(
          at,
          `expected an object, got ${describeValue(value)}`,
          `make ${toPointer(at).slice(1)} an object, such as ${example}`,
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
    const source = expectObject(config.source, ['source'], '{ "fsh": ["input/fsh"] }');
    for (const key of Object.keys(source)) {
      if (key !== 'fsh') fail(['source', key], `unknown key ${key}`, 'the only source key is fsh');
    }
    // [] is allowed: it omits FSH source lookup.
    if (source.fsh !== undefined) expectStrings(source.fsh, ['source', 'fsh'], 'FSH directories');
  }

  if (config.plugins !== undefined) {
    if (format === 'json') {
      fail(
        ['plugins'],
        'plugins can only be listed in an .mjs config, because a JSON config cannot load code',
        'move the config to sdc-questionnaire-lint.config.mjs and import the plugins there',
      );
    }
    if (!Array.isArray(config.plugins)) {
      fail(
        ['plugins'],
        `expected an array, got ${describeValue(config.plugins)}`,
        'list the imported plugins as an array: plugins: [myPlugin]',
      );
    }
  }

  if (config.rules !== undefined) {
    const rules = expectObject(config.rules, ['rules'], '{ "sdc/parse-error": "warning" }');
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

  if (config.suppress !== undefined) {
    if (!Array.isArray(config.suppress)) {
      fail(
        ['suppress'],
        `expected an array, got ${describeValue(config.suppress)}`,
        'list suppressions as an array of objects with rule, file and reason',
      );
      return config;
    }
    config.suppress.forEach((value: unknown, index) => {
      const at = ['suppress', index];
      const entry = expectObject(
        value,
        at,
        '{ "rule": "sdc/parse-error", "file": "…", "reason": "…" }',
      );
      for (const key of requiredSuppressionKeys) {
        if (entry[key] === undefined) fail(at, `${key} is missing`, requiredHelp[key] ?? '');
      }
      for (const [key, setting] of Object.entries(entry)) {
        const required = requiredSuppressionKeys.includes(key);
        if (!required && !selectorKeys.includes(key)) {
          fail(
            [...at, key],
            `unknown key ${key}`,
            `the known keys are ${[...requiredSuppressionKeys, ...selectorKeys].join(', ')}`,
          );
        }
        if (typeof setting !== 'string') {
          fail(
            [...at, key],
            `expected a string, got ${describeValue(setting)}`,
            `make ${key} a string`,
          );
        } else if (required && setting.trim() === '') {
          fail([...at, key], `${key} is blank`, requiredHelp[key] ?? '');
        } else if (setting === '') {
          fail([...at, key], `${key} is empty`, `give ${key} a value, or remove it`);
        } else if (key === 'pointer' && !jsonPointerPattern.test(setting)) {
          fail(
            [...at, key],
            `${JSON.stringify(setting)} is not a JSON Pointer`,
            "copy the pointer from the finding's jsonLocation.pointer, such as /item/0/extension/0/valueExpression/expression",
          );
        }
      }
    });
  }

  return config;
}
