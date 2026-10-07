import { describe, expect, it } from 'vitest';
import type { LoadedConfig } from '../../src/config/load.js';
import type { LintConfig } from '../../src/config/types.js';
import { registerRules } from '../../src/plugins/registry.js';

const display = 'sdc-questionnaire-lint.config.json';

function loaded(config: LintConfig): LoadedConfig {
  return { path: `/ig/${display}`, dir: '/ig', display, config };
}

function severities(rules: ReturnType<typeof registerRules>) {
  return rules.map(({ id, severity }) => [id, severity]);
}

describe('registerRules', () => {
  it('registers every built-in rule at its default severity, sorted by ID', () => {
    const rules = registerRules(null);
    expect(severities(rules)).toEqual([
      ['lint/stale-suppression', 'warning'],
      ['sdc/fragment-parse-error', 'error'],
      ['sdc/parse-error', 'error'],
      ['sdc/query-syntax', 'error'],
      ['sdc/uncatalogued-expression', 'info'],
      ['sdc/unknown-function', 'error'],
    ]);
    expect(rules.map(({ id }) => id)).toEqual(rules.map(({ id }) => id).sort());
    expect(rules[1]?.rule.meta.defaultSeverity).toBe('error');
  });

  it('applies a configured severity and off', () => {
    const rules = registerRules(
      loaded({ rules: { 'sdc/parse-error': 'warning', 'sdc/uncatalogued-expression': 'off' } }),
    );
    expect(severities(rules)).toEqual([
      ['lint/stale-suppression', 'warning'],
      ['sdc/fragment-parse-error', 'error'],
      ['sdc/parse-error', 'warning'],
      ['sdc/query-syntax', 'error'],
      ['sdc/uncatalogued-expression', 'off'],
      ['sdc/unknown-function', 'error'],
    ]);
  });

  it('fails for an unknown rule ID, naming a similar one', () => {
    expect(() => registerRules(loaded({ rules: { 'sdc/parse-eror': 'warning' } }))).toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        path: display,
        message: `config ${display} is invalid at /rules/sdc~1parse-eror: unknown rule sdc/parse-eror`,
        help: 'a rule with a similar name exists: sdc/parse-error',
      }),
    );
  });

  it('fails for an unknown rule ID with nothing similar, pointing at explain', () => {
    expect(() => registerRules(loaded({ rules: { 'sdc/undefined-variable': 'off' } }))).toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        help: 'run sdc-lint explain to list the registered rules',
      }),
    );
  });

  it('accepts off for lint/stale-suppression', () => {
    const rules = registerRules(loaded({ rules: { 'lint/stale-suppression': 'off' } }));
    expect(rules.find(({ id }) => id === 'lint/stale-suppression')?.severity).toBe('off');
  });

  it.each(['error', 'info'] as const)('rejects %s for lint/stale-suppression', (setting) => {
    expect(() => registerRules(loaded({ rules: { 'lint/stale-suppression': setting } }))).toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        message: `config ${display} is invalid at /rules/lint~1stale-suppression: lint/stale-suppression can only be warning or off`,
        help: 'set lint/stale-suppression to warning or off',
      }),
    );
  });

  const suppression = { file: 'Questionnaire-A.json', reason: 'demo' };

  it('fails for an unknown suppression rule, naming a similar one', () => {
    expect(() =>
      registerRules(
        loaded({
          suppress: [
            { ...suppression, rule: 'sdc/parse-error' },
            { ...suppression, rule: 'sdc/parse-eror' },
          ],
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        message: `config ${display} is invalid at /suppress/1/rule: unknown rule sdc/parse-eror`,
        help: 'a rule with a similar name exists: sdc/parse-error',
      }),
    );
  });

  it('rejects a suppression of a lint/ rule', () => {
    expect(() =>
      registerRules(loaded({ suppress: [{ ...suppression, rule: 'lint/stale-suppression' }] })),
    ).toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        message: `config ${display} is invalid at /suppress/0/rule: lint/stale-suppression findings cannot be suppressed`,
        help: 'set lint/stale-suppression to off in rules instead',
      }),
    );
  });
});
