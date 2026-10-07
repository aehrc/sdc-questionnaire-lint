import { describe, expect, it } from 'vitest';
import type { LoadedConfig } from '../../src/config/load.js';
import type { LintConfig } from '../../src/config/types.js';
import { buildRuleRegistry, type RegisteredRule } from '../../src/plugins/rule-registry.js';
import type { LintPlugin } from '../../src/plugins/types.js';

const display = 'sdc-questionnaire-lint.config.mjs';

function loaded(config: LintConfig): LoadedConfig {
  return { path: `/ig/${display}`, dir: '/ig', display, format: 'mjs', config };
}

const registerRules = (config: LoadedConfig | null) => buildRuleRegistry(config).rules;

function severities(rules: readonly RegisteredRule[]) {
  return rules.map(({ id, severity }) => [id, severity]);
}

function demoPlugin(): LintPlugin {
  return {
    meta: { name: 'demo', version: '1.2.3' },
    rules: {
      'no-today': {
        meta: { description: 'Flags today().', defaultSeverity: 'warning' },
        check: () => undefined,
      },
    },
  };
}

describe('buildRuleRegistry', () => {
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

  it("registers a plugin's rules as <name>/<key>, sorted among the sdc rules", () => {
    const registry = buildRuleRegistry(loaded({ plugins: [demoPlugin()] }));
    expect(severities(registry.rules)).toEqual([
      ['demo/no-today', 'warning'],
      ['lint/stale-suppression', 'warning'],
      ['sdc/fragment-parse-error', 'error'],
      ['sdc/parse-error', 'error'],
      ['sdc/query-syntax', 'error'],
      ['sdc/uncatalogued-expression', 'info'],
      ['sdc/unknown-function', 'error'],
    ]);
    expect(registry.rules[0]?.plugin).toBe('demo');
  });

  it('lists plugins sorted by name, with sdc and without lint', () => {
    const zeta: LintPlugin = { meta: { name: 'zeta', version: '0.0.1' }, rules: {} };
    const { plugins } = buildRuleRegistry(loaded({ plugins: [zeta, demoPlugin()] }));
    expect(plugins).toEqual([
      { name: 'demo', version: '1.2.3' },
      { name: 'sdc', version: expect.any(String) as string },
      { name: 'zeta', version: '0.0.1' },
    ]);
    expect(buildRuleRegistry(null).plugins.map(({ name }) => name)).toEqual(['sdc']);
  });

  it('applies a configured severity to a plugin rule', () => {
    const rules = registerRules(
      loaded({ plugins: [demoPlugin()], rules: { 'demo/no-today': 'error' } }),
    );
    expect(rules.find(({ id }) => id === 'demo/no-today')?.severity).toBe('error');
  });

  // A demo plugin with one rule, no-today; each argument overrides part of it.
  const rule = (meta: object = {}, more: object = {}) => ({
    meta: { description: 'Flags today().', defaultSeverity: 'warning', ...meta },
    check: () => undefined,
    ...more,
  });
  const plugin = (rules: unknown = { 'no-today': rule() }, meta: object = {}) => ({
    meta: { name: 'demo', version: '1.2.3', ...meta },
    rules,
  });
  const docs = { checks: 'c', why: 'w', exampleMessage: 'e', fix: 'f', limitations: 'l' };
  const at = '/plugins/0/rules/no-today';

  it.each<[string, unknown, string]>([
    ['a plugin that is not an object', 'demo', '/plugins/0'],
    ['no meta', { rules: {} }, '/plugins/0/meta'],
    ['a name with an underscore', plugin(undefined, { name: 'my_demo' }), '/plugins/0/meta/name'],
    ['a name with capitals', plugin(undefined, { name: 'Demo' }), '/plugins/0/meta/name'],
    ['an empty version', plugin(undefined, { version: '' }), '/plugins/0/meta/version'],
    ['rules that is not an object', plugin([]), '/plugins/0/rules'],
    ['a rule key with an underscore', plugin({ no_today: rule() }), '/plugins/0/rules/no_today'],
    ['a rule key in camel case', plugin({ NoToday: rule() }), '/plugins/0/rules/NoToday'],
    ['a rule that is not an object', plugin({ 'no-today': () => undefined }), at],
    ['a rule without meta', plugin({ 'no-today': { check: () => undefined } }), `${at}/meta`],
    [
      'an empty description',
      plugin({ 'no-today': rule({ description: '' }) }),
      `${at}/meta/description`,
    ],
    [
      'a bad default severity',
      plugin({ 'no-today': rule({ defaultSeverity: 'off' }) }),
      `${at}/meta/defaultSeverity`,
    ],
    [
      'a relative docsUrl',
      plugin({ 'no-today': rule({ docsUrl: 'docs/no-today.md' }) }),
      `${at}/meta/docsUrl`,
    ],
    [
      'docs that are not an object',
      plugin({ 'no-today': rule({ docs: 'see the README' }) }),
      `${at}/meta/docs`,
    ],
    [
      'docs with an empty field',
      plugin({ 'no-today': rule({ docs: { ...docs, fix: '' } }) }),
      `${at}/meta/docs/fix`,
    ],
    ['a missing check', plugin({ 'no-today': rule({}, { check: undefined }) }), `${at}/check`],
  ])('rejects %s, at its pointer', (_, value, pointer) => {
    expect(() => buildRuleRegistry(loaded({ plugins: [value as LintPlugin] }))).toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        path: display,
        message: expect.stringMatching(
          new RegExp(`^config ${display} is invalid at ${pointer}: \\S`),
        ) as string,
      }),
    );
  });

  it('accepts a plugin rule with an absolute docsUrl and complete docs', () => {
    const value = plugin({ 'no-today': rule({ docsUrl: 'https://example.org/no-today', docs }) });
    const registry = buildRuleRegistry(loaded({ plugins: [value as LintPlugin] }));
    expect(registry.rules.find(({ id }) => id === 'demo/no-today')?.rule.meta.docs).toEqual(docs);
  });

  it.each(['sdc', 'lint'])('rejects the reserved namespace %s', (name) => {
    const plugin = { ...demoPlugin(), meta: { name, version: '1.0.0' } };
    expect(() => buildRuleRegistry(loaded({ plugins: [plugin] }))).toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        message: expect.stringMatching(
          new RegExp(`^config ${display} is invalid at /plugins/0/meta/name: `),
        ) as string,
      }),
    );
  });

  it('rejects a duplicate namespace at the second entry', () => {
    expect(() => buildRuleRegistry(loaded({ plugins: [demoPlugin(), demoPlugin()] }))).toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        message: `config ${display} is invalid at /plugins/1/meta/name: the namespace demo is already registered`,
      }),
    );
  });

  const mustBeListed =
    'the plugin providing smart-forms/ rules must be listed in plugins in an .mjs config';

  it('says the plugin must be listed for an unknown namespace in rules', () => {
    expect(() =>
      buildRuleRegistry(loaded({ rules: { 'smart-forms/flat-variable-context': 'off' } })),
    ).toThrow(expect.objectContaining({ code: 'CONFIG_INVALID', help: mustBeListed }));
  });

  it('says the plugin must be listed for an unknown namespace in suppress', () => {
    expect(() =>
      buildRuleRegistry(
        loaded({ suppress: [{ ...suppression, rule: 'smart-forms/flat-variable-context' }] }),
      ),
    ).toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        message: `config ${display} is invalid at /suppress/0/rule: unknown rule smart-forms/flat-variable-context`,
        help: mustBeListed,
      }),
    );
  });

  it("accepts a suppression of a listed plugin's rule", () => {
    expect(() =>
      buildRuleRegistry(
        loaded({ plugins: [demoPlugin()], suppress: [{ ...suppression, rule: 'demo/no-today' }] }),
      ),
    ).not.toThrow();
  });
});
