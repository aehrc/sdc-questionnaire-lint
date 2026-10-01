import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { selectConfig } from '../../src/config/discover.js';
import { type LoadedConfig, loadConfig } from '../../src/config/load.js';
import type { LintConfig } from '../../src/config/types.js';
import { buildRegistry } from '../../src/plugins/registry.js';
import type { LintPlugin } from '../../src/plugins/types.js';

const display = 'sdc-questionnaire-lint.config.mjs';

function config(value: LintConfig): LoadedConfig {
  return { path: '/c.mjs', dir: '/', display, format: 'mjs', config: value };
}

function plugin(name: string, rules: Record<string, unknown> = {}): LintPlugin {
  return { meta: { name, version: '1.0.0' }, rules } as LintPlugin;
}

const rule = { meta: { description: 'Checks something.', defaultSeverity: 'warning' }, check() {} };

function invalidAt(pointer: string, problem: string): object {
  return {
    code: 'CONFIG_INVALID',
    path: display,
    message: `config ${display} is invalid at ${pointer}: ${problem}`,
  };
}

describe('buildRegistry', () => {
  it('registers sdc and lint/stale-suppression without a config', () => {
    const registry = buildRegistry(null);
    expect(registry.plugins).toEqual([{ name: 'sdc', version: expect.any(String) as unknown }]);
    expect(registry.rules.map((registered) => registered.id)).toEqual(['lint/stale-suppression']);
    expect(registry.rules[0]).toMatchObject({
      plugin: 'lint',
      defaultSeverity: 'warning',
      effectiveSeverity: 'warning',
      enabled: true,
    });
  });

  it('registers a test plugin from an .mjs config as test/<rule> and applies rule settings', async () => {
    const cwd = fileURLToPath(new URL('../fixtures/config/', import.meta.url));
    const selected = await selectConfig({ cwd, explicitPath: 'with-plugin.mjs' });
    if (selected === null) throw new Error('no config selected');
    const registry = buildRegistry(await loadConfig(selected));

    expect(registry.plugins.map((loaded) => loaded.name)).toEqual(['sdc', 'test']);
    expect(registry.rules.map((registered) => registered.id)).toEqual([
      'lint/stale-suppression',
      'test/finding-per-questionnaire',
      'test/second-rule',
    ]);
    expect(registry.rules[1]).toMatchObject({
      plugin: 'test',
      description: 'Reports one finding per Questionnaire.',
      defaultSeverity: 'warning',
      effectiveSeverity: 'error',
      enabled: true,
    });
    // A rule configured off stays registered so explain can list it.
    expect(registry.rules[2]).toMatchObject({
      defaultSeverity: 'info',
      effectiveSeverity: 'off',
      enabled: false,
    });
  });

  it('sorts plugins by namespace and rules by ID', () => {
    const registry = buildRegistry(
      config({ plugins: [plugin('zeta', { b: rule, a: rule }), plugin('alpha', { z: rule })] }),
    );
    expect(registry.plugins.map((loaded) => loaded.name)).toEqual(['alpha', 'sdc', 'zeta']);
    expect(registry.rules.map((registered) => registered.id)).toEqual([
      'alpha/z',
      'lint/stale-suppression',
      'zeta/a',
      'zeta/b',
    ]);
  });

  it('keeps docsUrl when a rule has one', () => {
    const documented = { ...rule, meta: { ...rule.meta, docsUrl: 'https://example.org/rule' } };
    const registry = buildRegistry(config({ plugins: [plugin('docs', { rule: documented })] }));
    expect(registry.rules.find((registered) => registered.id === 'docs/rule')).toMatchObject({
      docsUrl: 'https://example.org/rule',
    });
  });

  it("keeps a rule's bundled docs and lists every namespace", () => {
    const docs = { checks: 'c', why: 'w', exampleMessage: 'e', fix: 'f', limitations: 'l' };
    const documented = { ...rule, meta: { ...rule.meta, docs } };
    const registry = buildRegistry(config({ plugins: [plugin('docs', { rule: documented })] }));
    expect(registry.rules.find((registered) => registered.id === 'docs/rule')?.docs).toEqual(docs);
    expect(registry.namespaces).toEqual(['docs', 'lint', 'sdc']);
  });

  it('lets config turn lint/stale-suppression off', () => {
    const registry = buildRegistry(config({ rules: { 'lint/stale-suppression': 'off' } }));
    expect(registry.rules[0]).toMatchObject({ effectiveSeverity: 'off', enabled: false });
  });

  it.each<[string, unknown, string, string]>([
    ['a plugin that is not an object', 'smart-forms', '/plugins/0', 'is not a plugin object'],
    ['a plugin without meta', { rules: {} }, '/plugins/0/meta', 'the plugin has no meta object'],
    [
      'a plugin with an invalid name',
      plugin('Smart Forms'),
      '/plugins/0/meta/name',
      'the plugin name must be a lowercase namespace such as smart-forms',
    ],
    [
      'a plugin without a version',
      { meta: { name: 'x' }, rules: {} },
      '/plugins/0/meta/version',
      'the plugin has no version',
    ],
    [
      'a plugin without rules',
      { meta: { name: 'x', version: '1' } },
      '/plugins/0/rules',
      'the plugin has no rules object',
    ],
    [
      'an invalid rule key',
      plugin('x', { 'Bad/Key': rule }),
      '/plugins/0/rules/Bad~1Key',
      'rule key Bad/Key is not a lowercase name such as flat-variable-context',
    ],
    [
      'a rule without a description',
      plugin('x', { r: { ...rule, meta: { defaultSeverity: 'warning' } } }),
      '/plugins/0/rules/r/meta/description',
      'the rule has no description',
    ],
    [
      'a rule with an invalid default severity',
      plugin('x', { r: { ...rule, meta: { description: 'd', defaultSeverity: 'off' } } }),
      '/plugins/0/rules/r/meta/defaultSeverity',
      'the rule default severity is not error, warning or info',
    ],
    [
      'a rule without check',
      plugin('x', { r: { meta: rule.meta } }),
      '/plugins/0/rules/r/check',
      'the rule has no check function',
    ],
    [
      'rule docs that are not an object',
      plugin('x', { r: { ...rule, meta: { ...rule.meta, docs: 'text' } } }),
      '/plugins/0/rules/r/meta/docs',
      'the rule docs are not an object',
    ],
    [
      'rule docs missing a section',
      plugin('x', {
        r: {
          ...rule,
          meta: { ...rule.meta, docs: { checks: 'c', why: 'w', exampleMessage: 'e', fix: 'f' } },
        },
      }),
      '/plugins/0/rules/r/meta/docs/limitations',
      'the rule docs have no limitations text',
    ],
    [
      'a plugin named lint',
      plugin('lint'),
      '/plugins/0/meta/name',
      'the lint namespace is reserved for findings about the configuration',
    ],
    [
      'a plugin named sdc',
      plugin('sdc'),
      '/plugins/0/meta/name',
      'the namespace sdc is already registered',
    ],
  ])('rejects %s', (_name, value, pointer, problem) => {
    expect(() => buildRegistry(config({ plugins: [value as LintPlugin] }))).toThrow(
      expect.objectContaining(invalidAt(pointer, problem)),
    );
  });

  it('rejects a duplicate namespace at the second plugin', () => {
    expect(() =>
      buildRegistry(config({ plugins: [plugin('test'), plugin('test', { r: rule })] })),
    ).toThrow(
      expect.objectContaining(
        invalidAt('/plugins/1/meta/name', 'the namespace test is already registered'),
      ),
    );
  });

  it('rejects an unknown rule ID and names a similar one', () => {
    expect(() =>
      buildRegistry(
        config({
          plugins: [plugin('test', { 'finding-per-item': rule })],
          rules: { 'test/finding-per-iten': 'off' },
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        ...invalidAt('/rules/test~1finding-per-iten', 'unknown rule test/finding-per-iten'),
        help: 'a rule with a similar name exists: test/finding-per-item',
      }),
    );
  });

  it('prefers a similar rule ID over the unregistered-namespace help', () => {
    expect(() =>
      buildRegistry(
        config({ plugins: [plugin('test', { rule })], rules: { 'tests/rule': 'off' } }),
      ),
    ).toThrow(expect.objectContaining({ help: 'a rule with a similar name exists: test/rule' }));
  });

  it('explains an unknown rule from an unregistered namespace', () => {
    expect(() =>
      buildRegistry(config({ rules: { 'smart-forms/flat-variable-context': 'off' } })),
    ).toThrow(
      expect.objectContaining({
        help: 'the plugin providing smart-forms/ rules must be listed in plugins in an .mjs config',
      }),
    );
  });

  it('points to explain for an unknown rule with no similar name', () => {
    expect(() => buildRegistry(config({ rules: { 'sdc/nothing-like-it': 'off' } }))).toThrow(
      expect.objectContaining({ help: 'run sdc-lint explain to list the registered rules' }),
    );
  });
});
