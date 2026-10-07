import { describe, expect, it } from 'vitest';
import { validateConfig } from '../../src/config/validate.js';

const display = 'sdc-questionnaire-lint.config.json';
const json = { display, format: 'json' } as const;

describe('validateConfig', () => {
  it.each([
    ['not an object', [], 'the top level', 'expected a config object, got an array'],
    ['an unknown key', { rulez: {} }, '/rulez', 'unknown key rulez'],
    ['presets, not accepted yet', { presets: [] }, '/presets', 'unknown key presets'],
    ['empty files', { files: [] }, '/files', 'files is empty'],
    [
      'a non-string files entry',
      { files: ['a', 1] },
      '/files/1',
      'expected a non-empty string, got a number',
    ],
    ['an unknown key under source', { source: { java: [] } }, '/source/java', 'unknown key java'],
    [
      'a bad rule setting',
      { rules: { 'sdc/parse-error': 'fatal' } },
      '/rules/sdc~1parse-error',
      '"fatal" is not a rule setting',
    ],
  ])('rejects %s, naming the entry', (_, raw, where, problem) => {
    expect(() => validateConfig(raw, json)).toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        path: display,
        message: `config ${display} is invalid at ${where}: ${problem}`,
      }),
    );
  });

  it('lists the known keys for an unknown key', () => {
    expect(() => validateConfig({ rulez: {} }, json)).toThrow(
      expect.objectContaining({
        help: 'the known keys are files, plugins, rules, source, suppress',
      }),
    );
  });

  it('names the expected shape for a key that is not an object', () => {
    expect(() => validateConfig({ rules: [] }, json)).toThrow(
      expect.objectContaining({
        help: 'make rules an object, such as { "sdc/parse-error": "warning" }',
      }),
    );
  });

  const entry = { rule: 'sdc/parse-error', file: 'Questionnaire-A.json', reason: 'demo' };

  it.each([
    [
      'suppress that is not an array',
      { suppress: {} },
      '/suppress',
      'expected an array, got an object',
    ],
    [
      'an entry that is not an object',
      { suppress: ['x'] },
      '/suppress/0',
      'expected an object, got a string',
    ],
    [
      'a missing rule',
      { suppress: [{ file: 'A.json', reason: 'r' }] },
      '/suppress/0',
      'rule is missing',
    ],
    [
      'a blank reason',
      { suppress: [{ ...entry, reason: '  ' }] },
      '/suppress/0/reason',
      'reason is blank',
    ],
    [
      'a reason that is not a string',
      { suppress: [{ ...entry, reason: 1 }] },
      '/suppress/0/reason',
      'expected a string, got a number',
    ],
    [
      'a missing file',
      { suppress: [entry, { rule: 'sdc/parse-error', reason: 'r' }] },
      '/suppress/1',
      'file is missing',
    ],
    [
      'an unknown key',
      { suppress: [{ ...entry, declaration: 'x' }] },
      '/suppress/0/declaration',
      'unknown key declaration',
    ],
    [
      'an empty selector',
      { suppress: [{ ...entry, linkId: '' }] },
      '/suppress/0/linkId',
      'linkId is empty',
    ],
    [
      'a selector that is not a string',
      { suppress: [{ ...entry, name: 1 }] },
      '/suppress/0/name',
      'expected a string, got a number',
    ],
    [
      'a relative pointer',
      { suppress: [{ ...entry, pointer: 'item/0' }] },
      '/suppress/0/pointer',
      '"item/0" is not a JSON Pointer',
    ],
    [
      'a pointer with a bad escape',
      { suppress: [{ ...entry, pointer: '/a~2' }] },
      '/suppress/0/pointer',
      '"/a~2" is not a JSON Pointer',
    ],
  ])('rejects %s in suppress, naming the entry', (_, raw, where, problem) => {
    expect(() => validateConfig(raw, json)).toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        message: `config ${display} is invalid at ${where}: ${problem}`,
      }),
    );
  });

  it('lists the known keys of a suppression for an unknown key', () => {
    expect(() => validateConfig({ suppress: [{ ...entry, declaration: 'x' }] }, json)).toThrow(
      expect.objectContaining({
        help: 'the known keys are rule, reason, file, linkId, extensionUrl, name, resource, pointer',
      }),
    );
  });

  it('accepts suppressions with every selector', () => {
    const config = {
      suppress: [
        entry,
        {
          ...entry,
          linkId: 'q',
          extensionUrl: 'http://example.org/x',
          name: 'v',
          resource: 'Questionnaire/A',
          pointer: '/contained/0/extension/0/valueExpression/expression~1~0',
        },
      ],
    };
    expect(validateConfig(config, json)).toEqual(config);
  });

  it('accepts a config, with source.fsh [] omitting source lookup', () => {
    const config = {
      files: ['fsh-generated/resources'],
      source: { fsh: [] },
      rules: { 'sdc/parse-error': 'off' },
    };
    expect(validateConfig(config, json)).toEqual(config);
  });

  it('rejects plugins in a JSON config, which cannot load code', () => {
    expect(() => validateConfig({ plugins: [] }, json)).toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        message: `config ${display} is invalid at /plugins: plugins can only be listed in an .mjs config, because a JSON config cannot load code`,
      }),
    );
  });

  it('rejects plugins that is not an array in an .mjs config', () => {
    const mjs = { display: 'sdc-questionnaire-lint.config.mjs', format: 'mjs' } as const;
    expect(() => validateConfig({ plugins: {} }, mjs)).toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        message:
          'config sdc-questionnaire-lint.config.mjs is invalid at /plugins: expected an array, got an object',
      }),
    );
  });

  it('accepts plugins in an .mjs config, leaving their elements to the rule registry', () => {
    const mjs = { display: 'sdc-questionnaire-lint.config.mjs', format: 'mjs' } as const;
    const config = { plugins: [1] };
    expect(validateConfig(config, mjs)).toEqual(config);
  });
});
