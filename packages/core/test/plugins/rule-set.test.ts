import { describe, expect, it } from 'vitest';
import type { LoadedConfig } from '../../src/config/load.js';
import type { LintConfig } from '../../src/config/types.js';
import { type ResolvedRule, resolveRuleSet } from '../../src/plugins/rule-set.js';
import type { LintPlugin } from '../../src/plugins/contract.js';

const display = 'sdc-questionnaire-lint.config.mjs';

function loaded(config: LintConfig): LoadedConfig {
  return { path: `/ig/${display}`, dir: '/ig', display, format: 'mjs', config };
}

const resolveRules = (config: LoadedConfig | null) => resolveRuleSet(config).rules;

function severities(rules: readonly ResolvedRule[]) {
  return rules.map(({ id, setting }) => [id, setting]);
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

describe('resolveRuleSet', () => {
  it('registers every built-in rule at its default severity, sorted by ID', () => {
    const rules = resolveRules(null);
    expect(severities(rules)).toEqual([
      ['lint/stale-suppression', 'warning'],
      ['sdc/dependency-cycle', 'warning'],
      ['sdc/duplicate-declaration', 'error'],
      ['sdc/external-expression', 'info'],
      ['sdc/fragment-parse-error', 'error'],
      ['sdc/language-not-allowed', 'error'],
      ['sdc/language-not-in-value-set', 'warning'],
      ['sdc/parse-error', 'error'],
      ['sdc/query-syntax', 'error'],
      ['sdc/reserved-name', 'error'],
      ['sdc/shadowed-declaration', 'info'],
      ['sdc/uncatalogued-expression', 'info'],
      ['sdc/undefined-variable', 'error'],
      ['sdc/unknown-function', 'error'],
      ['sdc/unresolved-linkid', 'warning'],
      ['sdc/unused-declaration', 'warning'],
    ]);
    expect(rules.map(({ id }) => id)).toEqual(rules.map(({ id }) => id).sort());
    expect(rules[1]?.rule.meta.defaultSeverity).toBe('warning');
  });

  it('applies a configured severity and off', () => {
    const rules = resolveRules(
      loaded({ rules: { 'sdc/parse-error': 'warning', 'sdc/uncatalogued-expression': 'off' } }),
    );
    expect(severities(rules)).toEqual([
      ['lint/stale-suppression', 'warning'],
      ['sdc/dependency-cycle', 'warning'],
      ['sdc/duplicate-declaration', 'error'],
      ['sdc/external-expression', 'info'],
      ['sdc/fragment-parse-error', 'error'],
      ['sdc/language-not-allowed', 'error'],
      ['sdc/language-not-in-value-set', 'warning'],
      ['sdc/parse-error', 'warning'],
      ['sdc/query-syntax', 'error'],
      ['sdc/reserved-name', 'error'],
      ['sdc/shadowed-declaration', 'info'],
      ['sdc/uncatalogued-expression', 'off'],
      ['sdc/undefined-variable', 'error'],
      ['sdc/unknown-function', 'error'],
      ['sdc/unresolved-linkid', 'warning'],
      ['sdc/unused-declaration', 'warning'],
    ]);
  });

  it('fails for an unknown rule ID, naming a similar one', () => {
    expect(() => resolveRules(loaded({ rules: { 'sdc/parse-eror': 'warning' } }))).toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        path: display,
        message: `config ${display} is invalid at /rules/sdc~1parse-eror: unknown rule sdc/parse-eror`,
        help: 'a rule with a similar name exists: sdc/parse-error',
      }),
    );
  });

  it('fails for an unknown rule ID with nothing similar, pointing at explain', () => {
    expect(() => resolveRules(loaded({ rules: { 'sdc/made-up-rule': 'off' } }))).toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        help: 'run sdc-lint explain to list the registered rules',
      }),
    );
  });

  it('accepts off for lint/stale-suppression', () => {
    const rules = resolveRules(loaded({ rules: { 'lint/stale-suppression': 'off' } }));
    expect(rules.find(({ id }) => id === 'lint/stale-suppression')?.setting).toBe('off');
  });

  it.each(['error', 'info'] as const)('rejects %s for lint/stale-suppression', (setting) => {
    expect(() => resolveRules(loaded({ rules: { 'lint/stale-suppression': setting } }))).toThrow(
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
      resolveRules(
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
      resolveRules(loaded({ suppress: [{ ...suppression, rule: 'lint/stale-suppression' }] })),
    ).toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        message: `config ${display} is invalid at /suppress/0/rule: lint/stale-suppression findings cannot be suppressed`,
        help: 'set lint/stale-suppression to off in rules instead',
      }),
    );
  });

  it("registers a plugin's rules as <name>/<key>, sorted among the sdc rules", () => {
    const ruleSet = resolveRuleSet(loaded({ plugins: [demoPlugin()] }));
    expect(severities(ruleSet.rules)).toEqual([
      ['demo/no-today', 'warning'],
      ['lint/stale-suppression', 'warning'],
      ['sdc/dependency-cycle', 'warning'],
      ['sdc/duplicate-declaration', 'error'],
      ['sdc/external-expression', 'info'],
      ['sdc/fragment-parse-error', 'error'],
      ['sdc/language-not-allowed', 'error'],
      ['sdc/language-not-in-value-set', 'warning'],
      ['sdc/parse-error', 'error'],
      ['sdc/query-syntax', 'error'],
      ['sdc/reserved-name', 'error'],
      ['sdc/shadowed-declaration', 'info'],
      ['sdc/uncatalogued-expression', 'info'],
      ['sdc/undefined-variable', 'error'],
      ['sdc/unknown-function', 'error'],
      ['sdc/unresolved-linkid', 'warning'],
      ['sdc/unused-declaration', 'warning'],
    ]);
    expect(ruleSet.rules[0]?.namespace).toBe('demo');
  });

  it('lists plugins sorted by name, with sdc and without lint', () => {
    const zeta: LintPlugin = { meta: { name: 'zeta', version: '0.0.1' }, rules: {} };
    const { pluginVersions } = resolveRuleSet(loaded({ plugins: [zeta, demoPlugin()] }));
    expect(pluginVersions).toEqual([
      { name: 'demo', version: '1.2.3' },
      { name: 'sdc', version: expect.any(String) as string },
      { name: 'zeta', version: '0.0.1' },
    ]);
    expect(resolveRuleSet(null).pluginVersions.map(({ name }) => name)).toEqual(['sdc']);
  });

  it('applies a configured severity to a plugin rule', () => {
    const rules = resolveRules(
      loaded({ plugins: [demoPlugin()], rules: { 'demo/no-today': 'error' } }),
    );
    expect(rules.find(({ id }) => id === 'demo/no-today')?.setting).toBe('error');
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
    [
      'a hostVariables that is not a function',
      { ...demoPlugin(), hostVariables: ['PrePopQuery'] },
      '/plugins/0/hostVariables',
    ],
  ])('rejects %s, at its pointer', (_, value, pointer) => {
    expect(() => resolveRuleSet(loaded({ plugins: [value as LintPlugin] }))).toThrow(
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
    const ruleSet = resolveRuleSet(loaded({ plugins: [value as LintPlugin] }));
    expect(ruleSet.rules.find(({ id }) => id === 'demo/no-today')?.rule.meta.docs).toEqual(docs);
  });

  it.each(['sdc', 'lint'])('rejects the reserved namespace %s', (name) => {
    const plugin = { ...demoPlugin(), meta: { name, version: '1.0.0' } };
    expect(() => resolveRuleSet(loaded({ plugins: [plugin] }))).toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        message: expect.stringMatching(
          new RegExp(`^config ${display} is invalid at /plugins/0/meta/name: `),
        ) as string,
      }),
    );
  });

  it('rejects a duplicate namespace at the second entry', () => {
    expect(() => resolveRuleSet(loaded({ plugins: [demoPlugin(), demoPlugin()] }))).toThrow(
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
      resolveRuleSet(loaded({ rules: { 'smart-forms/flat-variable-context': 'off' } })),
    ).toThrow(expect.objectContaining({ code: 'CONFIG_INVALID', help: mustBeListed }));
  });

  it('says the plugin must be listed for an unknown namespace in suppress', () => {
    expect(() =>
      resolveRuleSet(
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
      resolveRuleSet(
        loaded({ plugins: [demoPlugin()], suppress: [{ ...suppression, rule: 'demo/no-today' }] }),
      ),
    ).not.toThrow();
  });
});

describe('resolveRuleSet compat', () => {
  // A plugin that declares compat, with two verified versions of renderer.
  function stackPlugin(
    compat: unknown = {
      verified: {
        renderer: ['1.3.0', '1.4.0'],
        populate: ['4.7.1'],
        'template-extract': ['1.0.15'],
      },
      required: ['renderer', 'populate'],
    },
  ): LintPlugin {
    return { meta: { name: 'stack', version: '0.1.0' }, rules: {}, compat } as LintPlugin;
  }
  const resolveCompat = (config: LintConfig) => resolveRuleSet(loaded(config)).compat;
  const latest = { renderer: '1.4.0', populate: '4.7.1', 'template-extract': '1.0.15' };

  function expectInvalid(config: LintConfig, pointer: string, problem: string, help?: string) {
    expect(() => resolveRuleSet(loaded(config))).toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        message: `config ${display} is invalid at ${pointer}: ${problem}`,
        ...(help === undefined ? {} : { help }),
      }),
    );
  }

  it('is empty without a plugin that declares compat', () => {
    expect(resolveRuleSet(null).compat).toEqual({});
    expect(resolveCompat({ plugins: [demoPlugin()] })).toEqual({});
  });

  it('selects the last verified version of every component when the config has no entry', () => {
    expect(resolveCompat({ plugins: [stackPlugin()] })).toEqual({ stack: latest });
  });

  it('selects the last verified version of every component for latest', () => {
    expect(resolveCompat({ plugins: [stackPlugin()], compat: { stack: 'latest' } })).toEqual({
      stack: latest,
    });
  });

  it('selects exact versions, and leaves out an optional component that is not named', () => {
    const compat = { stack: { renderer: '1.3.0', populate: '4.7.1' } };
    expect(resolveCompat({ plugins: [stackPlugin()], compat })).toEqual(compat);
  });

  it('gives each rule the frozen versions of its own namespace', () => {
    const rule = { meta: { description: 'd', defaultSeverity: 'warning' }, check: () => undefined };
    const plugin = { ...stackPlugin(), rules: { 'no-today': rule } } as LintPlugin;
    const rules = resolveRules(loaded({ plugins: [plugin, demoPlugin()] }));
    const stackRule = rules.find(({ id }) => id === 'stack/no-today');
    expect(stackRule?.compat).toEqual(latest);
    expect(Object.isFrozen(stackRule?.compat)).toBe(true);
    expect(rules.find(({ id }) => id === 'demo/no-today')?.compat).toEqual({});
    expect(rules.find(({ id }) => id === 'sdc/parse-error')?.compat).toEqual({});
  });

  it("keeps the plugins with a hostVariables hook in config order, with their rules' compat", () => {
    const hostVariables = () => [];
    const rule = { meta: { description: 'd', defaultSeverity: 'info' }, check: () => undefined };
    const stack = { ...stackPlugin(), rules: { r: rule }, hostVariables } as LintPlugin;
    const other = { ...demoPlugin(), meta: { name: 'other', version: '1.0.0' }, hostVariables };
    const ruleSet = resolveRuleSet(loaded({ plugins: [other, demoPlugin(), stack] }));
    expect(ruleSet.hostVariableHooks.map(({ plugin }) => plugin)).toEqual([other, stack]);
    const [otherHook, stackHook] = ruleSet.hostVariableHooks;
    expect(stackHook?.compat).toBe(ruleSet.rules.find(({ id }) => id === 'stack/r')?.compat);
    expect(stackHook?.compat).toEqual(latest);
    expect(otherHook?.compat).toBe(ruleSet.rules.find(({ id }) => id === 'other/no-today')?.compat);
    expect(otherHook?.compat).toEqual({});
    expect(Object.isFrozen(otherHook?.compat)).toBe(true);
    expect(resolveRuleSet(null).hostVariableHooks).toEqual([]);
  });

  it('reads only own properties, whatever the plugin and component names', () => {
    const rule = { meta: { description: 'd', defaultSeverity: 'warning' }, check: () => undefined };
    const named = (name: string, compat?: object) =>
      ({ meta: { name, version: '0.1.0' }, rules: { 'no-today': rule }, compat }) as LintPlugin;
    const compat = {
      verified: { renderer: ['1.4.0'], constructor: ['1.0.0'] },
      required: ['renderer'],
    };
    // No config entry for constructor: it defaults to latest.
    const ruleSet = resolveRuleSet(
      loaded({
        plugins: [named('constructor', compat), named('to-string'), named('stack', compat)],
        compat: { stack: { renderer: '1.4.0' } },
      }),
    );
    expect(ruleSet.compat).toEqual({
      constructor: { renderer: '1.4.0', constructor: '1.0.0' },
      stack: { renderer: '1.4.0' },
    });
    expect(ruleSet.rules.find(({ id }) => id === 'to-string/no-today')?.compat).toEqual({});
    // A plugin without compat named like an Object.prototype member gets {} too.
    const bare = resolveRuleSet(loaded({ plugins: [named('constructor')] }));
    expect(bare.compat).toEqual({});
    expect(bare.rules.find(({ id }) => id === 'constructor/no-today')?.compat).toEqual({});
  });

  it('fails for a namespace that no listed plugin has', () => {
    expectInvalid(
      { compat: { 'smart-forms': 'latest' } },
      '/compat/smart-forms',
      'no listed plugin has the namespace smart-forms',
      'list the plugin providing smart-forms/ rules in plugins in an .mjs config',
    );
  });

  it.each(['demo', 'sdc'])('fails for the %s plugin, which declares no compat', (name) => {
    expectInvalid(
      { plugins: [demoPlugin()], compat: { [name]: 'latest' } },
      `/compat/${name}`,
      `the ${name} plugin does not check against runtime versions`,
      `remove ${name} from compat`,
    );
  });

  it('fails for an unknown component, listing the components', () => {
    expectInvalid(
      {
        plugins: [stackPlugin()],
        compat: { stack: { renderer: '1.4.0', populate: '4.7.1', sdk: '1' } },
      },
      '/compat/stack/sdk',
      'unknown component sdk',
      'the stack components are renderer, populate, template-extract',
    );
  });

  it('fails for a missing required component', () => {
    expectInvalid(
      { plugins: [stackPlugin()], compat: { stack: { renderer: '1.4.0' } } },
      '/compat/stack',
      'populate is missing',
      'set populate to a verified version: 4.7.1',
    );
  });

  it('fails for a version that is not verified, without falling back to the nearest one', () => {
    expectInvalid(
      { plugins: [stackPlugin()], compat: { stack: { renderer: '1.4.1', populate: '4.7.1' } } },
      '/compat/stack/renderer',
      'renderer 1.4.1 is not a verified version',
      'set renderer to a verified version: 1.3.0, 1.4.0',
    );
  });

  const verified = { renderer: ['1.4.0'] };
  it.each<[string, unknown, string]>([
    ['compat that is not an object', 'latest', '/plugins/0/compat'],
    ['no verified object', { required: [] }, '/plugins/0/compat/verified'],
    ['no components', { verified: {}, required: [] }, '/plugins/0/compat/verified'],
    [
      'a component with no versions',
      { verified: { renderer: [] }, required: [] },
      '/plugins/0/compat/verified/renderer',
    ],
    [
      'an empty version',
      { verified: { renderer: ['1.4.0', ''] }, required: [] },
      '/plugins/0/compat/verified/renderer/1',
    ],
    [
      'latest as a version',
      { verified: { renderer: ['latest'] }, required: [] },
      '/plugins/0/compat/verified/renderer/0',
    ],
    [
      'a hole in the versions',
      { verified: { renderer: new Array(1) }, required: [] },
      '/plugins/0/compat/verified/renderer/0',
    ],
    [
      'a repeated version',
      { verified: { renderer: ['1.4.0', '1.4.0'] }, required: [] },
      '/plugins/0/compat/verified/renderer/1',
    ],
    ['no required array', { verified }, '/plugins/0/compat/required'],
    [
      'a required component that is not verified',
      { verified, required: ['populate'] },
      '/plugins/0/compat/required/0',
    ],
    [
      'a hole in the required components',
      { verified, required: new Array(1) },
      '/plugins/0/compat/required/0',
    ],
    [
      'a repeated required component',
      { verified, required: ['renderer', 'renderer'] },
      '/plugins/0/compat/required/1',
    ],
  ])("rejects a plugin's compat with %s, at its pointer", (_, compat, pointer) => {
    expect(() => resolveRuleSet(loaded({ plugins: [stackPlugin(compat)] }))).toThrow(
      expect.objectContaining({
        code: 'CONFIG_INVALID',
        message: expect.stringMatching(
          new RegExp(`^config ${display} is invalid at ${pointer}: \\S`),
        ) as string,
      }),
    );
  });
});
