import { LintFailure } from '../failure.js';
import { toPointer } from '../json-pointer.js';
import { closestName } from '../suggest.js';
import type { LintConfig } from './types.js';

export type ConfigFormat = 'json' | 'mjs';

const topLevelKeys = [
  'presets',
  'plugins',
  'compat',
  'languages',
  'source',
  'rules',
  'files',
  'suppress',
];
const ruleSettings = ['error', 'warning', 'info', 'off'];

// A CONFIG_INVALID failure naming the config file and the JSON Pointer of the offending entry.
// For .mjs, the pointer addresses the exported config object.
export function configInvalid(
  display: string,
  at: readonly (string | number)[],
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

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value === 'object' ? 'an object' : `a ${typeof value}`;
}

// Checks the config's shape. Plugins are checked by the registry, and suppression selectors when
// suppressions are applied.
export function validateConfig(
  raw: unknown,
  { display, format }: { display: string; format: ConfigFormat },
): LintConfig {
  const fail = (at: readonly (string | number)[], problem: string, help: string): never => {
    throw configInvalid(display, at, problem, help);
  };
  const expectObject = (
    value: unknown,
    at: readonly (string | number)[],
  ): Record<string, unknown> =>
    isObject(value)
      ? value
      : fail(
          at,
          `expected an object, got ${describeValue(value)}`,
          'see docs/cli.md for the config format',
        );
  const expectStrings = (value: unknown, at: readonly (string | number)[], what: string): void => {
    if (!Array.isArray(value)) {
      fail(
        at,
        `expected an array of ${what}, got ${describeValue(value)}`,
        `list the ${what} as an array of strings`,
      );
      return;
    }
    value.forEach((entry, index) => {
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
        format === 'mjs'
          ? 'export the config object: export default defineConfig({ … })'
          : 'make the file a JSON object, such as { "files": ["fsh-generated/resources"] }',
      );

  for (const key of Object.keys(config)) {
    if (topLevelKeys.includes(key)) continue;
    const similar = closestName(key, topLevelKeys);
    fail(
      [key],
      `unknown key ${key}`,
      similar === undefined
        ? `the known keys are ${topLevelKeys.join(', ')}`
        : `a key with a similar name exists: ${similar}`,
    );
  }

  if (config.presets !== undefined) expectStrings(config.presets, ['presets'], 'presets');

  if (config.plugins !== undefined) {
    if (format === 'json') {
      fail(
        ['plugins'],
        'plugins can only be listed in an .mjs config, because a JSON config cannot load code',
        'move the config to sdc-questionnaire-lint.config.mjs and import each plugin there',
      );
    }
    if (!Array.isArray(config.plugins)) {
      fail(
        ['plugins'],
        `expected an array of plugins, got ${describeValue(config.plugins)}`,
        'list imported plugins: plugins: [smartForms]',
      );
    }
  }

  if (config.compat !== undefined) expectObject(config.compat, ['compat']);

  if (config.languages !== undefined) {
    const languages = expectObject(config.languages, ['languages']);
    for (const [language, mode] of Object.entries(languages)) {
      if (typeof mode !== 'string') {
        fail(
          ['languages', language],
          `expected a string, got ${describeValue(mode)}`,
          'set each language to analyse or recognise',
        );
      }
    }
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

  if (config.suppress !== undefined) {
    if (!Array.isArray(config.suppress)) {
      fail(
        ['suppress'],
        `expected an array of suppressions, got ${describeValue(config.suppress)}`,
        'list each suppression as an object with rule, file and reason',
      );
      return config;
    }
    config.suppress.forEach((entry: unknown, index) => {
      const suppression = expectObject(entry, ['suppress', index]);
      if (typeof suppression.rule !== 'string' || suppression.rule === '') {
        fail(
          ['suppress', index, 'rule'],
          'the suppression has no rule',
          'name the rule to suppress, such as sdc/undefined-variable',
        );
      }
      if (typeof suppression.reason !== 'string' || suppression.reason.trim() === '') {
        fail(
          ['suppress', index, 'reason'],
          'the suppression has no reason',
          'write why this finding is acceptable in reason',
        );
      }
      if (
        suppression.file !== undefined &&
        (typeof suppression.file !== 'string' || suppression.file === '')
      ) {
        fail(
          ['suppress', index, 'file'],
          `expected a file path, got ${describeValue(suppression.file)}`,
          'give the input file the suppression applies to',
        );
      }
    });
  }

  return config;
}
