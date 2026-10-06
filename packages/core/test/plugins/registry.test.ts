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
      ['sdc/parse-error', 'error'],
      ['sdc/uncatalogued-expression', 'info'],
    ]);
    expect(rules.map(({ id }) => id)).toEqual(rules.map(({ id }) => id).sort());
    expect(rules[0]?.rule.meta.defaultSeverity).toBe('error');
  });

  it('applies a configured severity and off', () => {
    const rules = registerRules(
      loaded({ rules: { 'sdc/parse-error': 'warning', 'sdc/uncatalogued-expression': 'off' } }),
    );
    expect(severities(rules)).toEqual([
      ['sdc/parse-error', 'warning'],
      ['sdc/uncatalogued-expression', 'off'],
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
});
