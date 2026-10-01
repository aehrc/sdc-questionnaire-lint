import type { LoadedConfig } from '../config/load.js';
import { configInvalid, isObject } from '../config/validate.js';
import type { PackageVersion } from '../report/types.js';
import { closestName } from '../suggest.js';
import { lintPlugin, sdcPlugin } from './builtin.js';
import type { LintPlugin, LintRule, RuleDocs, Severity } from './types.js';

export interface RegisteredRule {
  // namespace/key, such as sdc/undefined-variable.
  id: string;
  plugin: string;
  description: string;
  defaultSeverity: Severity;
  effectiveSeverity: Severity | 'off';
  enabled: boolean;
  docsUrl?: string;
  docs?: RuleDocs;
  rule: LintRule;
}

export interface Registry {
  // Loaded plugins for run.plugins, sorted by namespace; excludes the internal lint namespace.
  plugins: PackageVersion[];
  // Every registered rule, including rules configured off, sorted by ID.
  rules: RegisteredRule[];
  // Every registered namespace, including lint and plugins without rules.
  namespaces: string[];
}

const docsFields = ['checks', 'why', 'exampleMessage', 'fix', 'limitations'] as const;

// Namespaces and rule keys share the report schema's rule ID syntax.
const namePattern = /^[a-z][a-z0-9-]*$/;
const severities: readonly string[] = ['error', 'warning', 'info'];

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Checks a configured plugin's shape; errors point into the exported config's plugins array.
function checkPlugin(value: unknown, index: number, display: string): LintPlugin {
  const at = ['plugins', index];
  const fail = (path: readonly (string | number)[], problem: string, help: string): never => {
    throw configInvalid(display, [...at, ...path], problem, help);
  };
  if (!isObject(value)) {
    return fail(
      [],
      'is not a plugin object',
      "list the plugin's default export: plugins: [smartForms]",
    );
  }
  const meta = isObject(value.meta)
    ? value.meta
    : fail(['meta'], 'the plugin has no meta object', 'give the plugin meta: { name, version }');
  if (typeof meta.name !== 'string' || !namePattern.test(meta.name)) {
    fail(
      ['meta', 'name'],
      'the plugin name must be a lowercase namespace such as smart-forms',
      'set meta.name to the rule namespace',
    );
  }
  if (typeof meta.version !== 'string' || meta.version === '') {
    fail(
      ['meta', 'version'],
      'the plugin has no version',
      'set meta.version to the package version',
    );
  }
  const rules = isObject(value.rules)
    ? value.rules
    : fail(
        ['rules'],
        'the plugin has no rules object',
        'give the plugin a rules object keyed by rule name',
      );
  for (const [key, rule] of Object.entries(rules)) {
    const ruleAt = ['rules', key];
    if (!namePattern.test(key)) {
      fail(
        ruleAt,
        `rule key ${key} is not a lowercase name such as flat-variable-context`,
        'rename the rule key; the namespace is added from meta.name',
      );
    }
    if (!isObject(rule))
      return fail(ruleAt, 'is not a rule object', 'give the rule meta and check');
    const ruleMeta = isObject(rule.meta)
      ? rule.meta
      : fail(
          [...ruleAt, 'meta'],
          'the rule has no meta object',
          'give the rule meta: { description, defaultSeverity }',
        );
    if (typeof ruleMeta.description !== 'string' || ruleMeta.description === '') {
      fail(
        [...ruleAt, 'meta', 'description'],
        'the rule has no description',
        'describe what the rule checks in one line',
      );
    }
    if (
      typeof ruleMeta.defaultSeverity !== 'string' ||
      !severities.includes(ruleMeta.defaultSeverity)
    ) {
      fail(
        [...ruleAt, 'meta', 'defaultSeverity'],
        'the rule default severity is not error, warning or info',
        'set meta.defaultSeverity to error, warning or info',
      );
    }
    if (ruleMeta.docs !== undefined) {
      const docs = isObject(ruleMeta.docs)
        ? ruleMeta.docs
        : fail(
            [...ruleAt, 'meta', 'docs'],
            'the rule docs are not an object',
            `give docs the fields ${docsFields.join(', ')}`,
          );
      for (const field of docsFields) {
        if (typeof docs[field] !== 'string' || docs[field] === '') {
          fail(
            [...ruleAt, 'meta', 'docs', field],
            `the rule docs have no ${field} text`,
            `give docs the fields ${docsFields.join(', ')}`,
          );
        }
      }
    }
    if (typeof rule.check !== 'function') {
      fail(
        [...ruleAt, 'check'],
        'the rule has no check function',
        'give the rule a check(ctx) function',
      );
    }
  }
  return value as unknown as LintPlugin;
}

// Registers the built-in sdc and lint plugins and the config's plugins, then applies rule settings.
export function buildRegistry(loaded: LoadedConfig | null): Registry {
  const display = loaded?.display ?? '';
  const config = loaded?.config ?? {};
  const plugins: LintPlugin[] = [sdcPlugin, lintPlugin];

  (config.plugins ?? []).forEach((value: unknown, index) => {
    const plugin = checkPlugin(value, index, display);
    const { name } = plugin.meta;
    if (name === 'lint') {
      throw configInvalid(
        display,
        ['plugins', index, 'meta', 'name'],
        'the lint namespace is reserved for findings about the configuration',
        'give the plugin another namespace',
      );
    }
    if (plugins.some((registered) => registered.meta.name === name)) {
      throw configInvalid(
        display,
        ['plugins', index, 'meta', 'name'],
        `the namespace ${name} is already registered`,
        'list each plugin once, and give each plugin its own namespace',
      );
    }
    plugins.push(plugin);
  });

  const byId = new Map<string, RegisteredRule>();
  for (const plugin of plugins) {
    for (const [key, rule] of Object.entries(plugin.rules)) {
      const id = `${plugin.meta.name}/${key}`;
      // Namespaces are unique and keys are unique within a plugin, so IDs cannot collide.
      byId.set(id, {
        id,
        plugin: plugin.meta.name,
        description: rule.meta.description,
        defaultSeverity: rule.meta.defaultSeverity,
        effectiveSeverity: rule.meta.defaultSeverity,
        enabled: true,
        ...(rule.meta.docsUrl === undefined ? {} : { docsUrl: rule.meta.docsUrl }),
        ...(rule.meta.docs === undefined ? {} : { docs: rule.meta.docs }),
        rule,
      });
    }
  }

  for (const [id, setting] of Object.entries(config.rules ?? {})) {
    const registered = byId.get(id);
    if (registered === undefined) {
      const help = unknownRuleHelp(
        id,
        [...byId.keys()],
        plugins.map((plugin) => plugin.meta.name),
      );
      throw configInvalid(display, ['rules', id], `unknown rule ${id}`, help);
    }
    registered.effectiveSeverity = setting;
    registered.enabled = setting !== 'off';
  }

  return {
    plugins: plugins
      .filter((plugin) => plugin !== lintPlugin)
      .map((plugin) => ({ name: plugin.meta.name, version: plugin.meta.version }))
      .sort((a, b) => compareStrings(a.name, b.name)),
    rules: [...byId.values()].sort((a, b) => compareStrings(a.id, b.id)),
    namespaces: plugins.map((plugin) => plugin.meta.name).sort(compareStrings),
  };
}

// Help for an unknown rule ID, shared by config errors and explain: a similar registered ID, else
// the plugin that must be listed for an unregistered namespace, else the rule list.
export function unknownRuleHelp(
  id: string,
  ruleIds: readonly string[],
  namespaces: readonly string[],
): string {
  const similar = closestName(id, ruleIds);
  if (similar !== undefined) return `a rule with a similar name exists: ${similar}`;
  const namespace = id.includes('/') ? id.slice(0, id.indexOf('/')) : id;
  if (!namespaces.includes(namespace)) {
    return `the plugin providing ${namespace}/ rules must be listed in plugins in an .mjs config`;
  }
  return 'run sdc-lint explain to list the registered rules';
}
