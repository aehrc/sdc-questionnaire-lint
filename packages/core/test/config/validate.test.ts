import { describe, expect, it } from 'vitest';
import { validateConfig } from '../../src/config/validate.js';

const display = 'sdc-questionnaire-lint.config.json';

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
    expect(() => validateConfig(raw, display)).toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        path: display,
        message: `config ${display} is invalid at ${where}: ${problem}`,
      }),
    );
  });

  it('lists the known keys for an unknown key', () => {
    expect(() => validateConfig({ rulez: {} }, display)).toThrow(
      expect.objectContaining({ help: 'the known keys are files, rules, source' }),
    );
  });

  it('accepts a config, with source.fsh [] omitting source lookup', () => {
    const config = {
      files: ['fsh-generated/resources'],
      source: { fsh: [] },
      rules: { 'sdc/parse-error': 'off' },
    };
    expect(validateConfig(config, display)).toEqual(config);
  });
});
