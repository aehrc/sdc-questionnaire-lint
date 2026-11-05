/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

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
    ['empty hostVariables', { hostVariables: [] }, '/hostVariables', 'hostVariables is empty'],
    [
      'an empty hostVariables entry',
      { hostVariables: ['a', ''] },
      '/hostVariables/1',
      'expected a non-empty string, got a string',
    ],
    [
      'a host variable written with %',
      { hostVariables: ['%PrePopQuery'] },
      '/hostVariables/0',
      '%PrePopQuery is written with %',
    ],
    [
      'a host variable listed twice',
      { hostVariables: ['a', 'b', 'a'] },
      '/hostVariables/2',
      'a is listed more than once',
    ],
    [
      'compat that is not an object',
      { compat: 'latest' },
      '/compat',
      'expected an object, got a string',
    ],
    [
      'a compat target that is neither latest nor an object',
      { compat: { 'smart-forms': 'newest' } },
      '/compat/smart-forms',
      'expected "latest" or an object of versions, got "newest"',
    ],
    [
      'a compat version that is not a string',
      { compat: { 'smart-forms': { renderer: 1.4 } } },
      '/compat/smart-forms/renderer',
      'expected a version string, got a number',
    ],
    [
      'an empty compat version',
      { compat: { 'smart-forms': { renderer: '' } } },
      '/compat/smart-forms/renderer',
      'renderer is empty',
    ],
    [
      'a per-component latest',
      { compat: { 'smart-forms': { renderer: 'latest' } } },
      '/compat/smart-forms/renderer',
      'renderer cannot be "latest"; only a whole namespace can',
    ],
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
        help: 'the known keys are compat, files, hostVariables, plugins, rules, source, suppress',
      }),
    );
  });

  it.each([
    [['%PrePopQuery'], 'write the name without %, as PrePopQuery'],
    [['a', 'a'], 'list each host variable once'],
  ])('says how to fix the host variables %j', (hostVariables, help) => {
    expect(() => validateConfig({ hostVariables }, json)).toThrow(
      expect.objectContaining({ help }),
    );
  });

  describe('a name FHIRPath, FHIR or SDC defines in hostVariables', () => {
    const suppress = (name: string) =>
      `remove ${name}; if the application running the form supplies %${name}, suppress the ` +
      'findings about it with a reason that names the application';
    const always = (name: string) => `remove ${name}: %${name} is always available`;

    it.each([
      ['questionnaire', 'SDC', suppress('questionnaire')],
      ['qitem', 'SDC', suppress('qitem')],
      ['resource', 'FHIR', always('resource')],
      ['context', 'FHIRPath', always('context')],
      ['vs-x', 'FHIR', always('vs-x')],
      ['ext-x', 'FHIR', always('ext-x')],
    ])('rejects %s at its index', (name, definer, help) => {
      expect(() => validateConfig({ hostVariables: ['PrePopQuery', name] }, json)).toThrow(
        expect.objectContaining({
          code: 'CONFIG_INVALID',
          message: `config ${display} is invalid at /hostVariables/1: ${name} is defined by ${definer}, so it is not a host variable`,
          help,
        }),
      );
    });

    it('accepts a name that only contains one', () => {
      const config = { hostVariables: ['myqitem', 'a vs-x', 'resources'] };
      expect(validateConfig(config, json)).toEqual(config);
    });
  });

  it('accepts latest and exact versions in compat', () => {
    const compat = { a: 'latest', b: { renderer: '1.4.0', populate: '4.7.1' } } as const;
    expect(validateConfig({ compat }, json)).toEqual({ compat });
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
      hostVariables: ['PrePopQuery', 'sourceQuery0'],
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

  it('accepts plugins in an .mjs config, leaving their elements to the rule set', () => {
    const mjs = { display: 'sdc-questionnaire-lint.config.mjs', format: 'mjs' } as const;
    const config = { plugins: [1] };
    expect(validateConfig(config, mjs)).toEqual(config);
  });
});
