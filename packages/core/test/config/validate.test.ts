import { describe, expect, it } from 'vitest';
import { type ConfigFormat, validateConfig } from '../../src/config/validate.js';

const display = 'sdc-questionnaire-lint.config.json';

function check(raw: unknown, format: ConfigFormat = 'json') {
  return () => validateConfig(raw, { display, format });
}

function invalidAt(pointer: string, problem: string): object {
  return {
    code: 'CONFIG_INVALID',
    path: display,
    message: `config ${display} is invalid at ${pointer}: ${problem}`,
  };
}

describe('validateConfig', () => {
  it('accepts a full config', () => {
    const config = {
      presets: ['sdc'],
      compat: { 'smart-forms': 'latest' },
      languages: { 'text/fhirpath': 'analyse' },
      source: { fsh: ['input/fsh'] },
      rules: { 'sdc/unused-declaration': 'warning', 'sdc/other': 'off' },
      files: ['fsh-generated/resources', 'extra/*.json'],
      suppress: [{ rule: 'sdc/x', file: 'a.json', linkId: 'q1', reason: 'Host supplies it.' }],
    };
    expect(check(config)()).toEqual(config);
  });

  it('accepts an empty config and source.fsh: []', () => {
    expect(check({})()).toEqual({});
    expect(check({ source: { fsh: [] } })()).toEqual({ source: { fsh: [] } });
  });

  it.each([
    ['an array', []],
    ['null', null],
    ['a string', 'files'],
  ])('rejects %s at the top level', (_name, raw) => {
    expect(check(raw)).toThrow(expect.objectContaining({ code: 'CONFIG_INVALID' }));
  });

  it('rejects an unknown top-level key and names a similar one', () => {
    expect(check({ file: ['a.json'] })).toThrow(
      expect.objectContaining({
        ...invalidAt('/file', 'unknown key file'),
        help: 'a key with a similar name exists: files',
      }),
    );
    expect(check({ colour: true })).toThrow(
      expect.objectContaining({
        help: 'the known keys are presets, plugins, compat, languages, source, rules, files, suppress',
      }),
    );
  });

  it.each<[string, unknown, string, string]>([
    ['empty files', { files: [] }, '/files', 'files is empty'],
    [
      'files that is not an array',
      { files: 'a.json' },
      '/files',
      'expected an array of input files, directories or globs, got a string',
    ],
    [
      'a non-string files entry',
      { files: ['a.json', 3] },
      '/files/1',
      'expected a non-empty string, got a number',
    ],
    [
      'an empty files entry',
      { files: [''] },
      '/files/0',
      'expected a non-empty string, got a string',
    ],
    [
      'source.fsh that is not an array',
      { source: { fsh: 'input/fsh' } },
      '/source/fsh',
      'expected an array of FSH directories, got a string',
    ],
    [
      'a non-string source.fsh entry',
      { source: { fsh: [null] } },
      '/source/fsh/0',
      'expected a non-empty string, got null',
    ],
    ['an unknown source key', { source: { fhs: [] } }, '/source/fhs', 'unknown key fhs'],
    [
      'an unknown rule setting',
      { rules: { 'sdc/x': 'warn' } },
      '/rules/sdc~1x',
      '"warn" is not a rule setting',
    ],
    [
      'a non-string rule setting',
      { rules: { 'sdc/x': 2 } },
      '/rules/sdc~1x',
      'a number is not a rule setting',
    ],
    [
      'plugins in a JSON config',
      { plugins: [] },
      '/plugins',
      'plugins can only be listed in an .mjs config, because a JSON config cannot load code',
    ],
    [
      'suppress that is not an array',
      { suppress: {} },
      '/suppress',
      'expected an array of suppressions, got an object',
    ],
    [
      'a suppression that is not an object',
      { suppress: ['sdc/x'] },
      '/suppress/0',
      'expected an object, got a string',
    ],
    [
      'a suppression without a rule',
      { suppress: [{ reason: 'Why.' }] },
      '/suppress/0/rule',
      'the suppression has no rule',
    ],
    [
      'a suppression without a reason',
      { suppress: [{ rule: 'sdc/x', reason: 'Why.' }, { rule: 'sdc/x' }] },
      '/suppress/1/reason',
      'the suppression has no reason',
    ],
    [
      'a suppression with a blank reason',
      { suppress: [{ rule: 'sdc/x', reason: '  ' }] },
      '/suppress/0/reason',
      'the suppression has no reason',
    ],
    [
      'a suppression with a non-string file',
      { suppress: [{ rule: 'sdc/x', reason: 'Why.', file: 1 }] },
      '/suppress/0/file',
      'expected a file path, got a number',
    ],
    [
      'presets that is not an array',
      { presets: 'sdc' },
      '/presets',
      'expected an array of presets, got a string',
    ],
    [
      'compat that is not an object',
      { compat: 'latest' },
      '/compat',
      'expected an object, got a string',
    ],
    [
      'a non-string language mode',
      { languages: { 'text/fhirpath': true } },
      '/languages/text~1fhirpath',
      'expected a string, got a boolean',
    ],
  ])('rejects %s', (_name, raw, pointer, problem) => {
    expect(check(raw)).toThrow(expect.objectContaining(invalidAt(pointer, problem)));
  });

  it('accepts plugins in an .mjs config and requires an array', () => {
    expect(check({ plugins: [] }, 'mjs')()).toEqual({ plugins: [] });
    expect(check({ plugins: {} }, 'mjs')).toThrow(
      expect.objectContaining(invalidAt('/plugins', 'expected an array of plugins, got an object')),
    );
  });
});
