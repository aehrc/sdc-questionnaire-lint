import type { LoadedConfig } from '../config/load.js';
import type { RuleSetting } from '../config/types.js';
import { invalidConfigFailure } from '../config/validate.js';
import { isObject } from '../object.js';
import type { PackageVersion } from '../report/types.js';
import { closestName } from '../suggest.js';
import { lintPlugin, sdcPlugin, staleSuppressionId } from './builtin.js';
import type { LintPlugin, LintRule } from './types.js';

export interface ResolvedRule {
  // sdc/parse-error
  id: string;
  // The namespace of the plugin providing the rule.
  namespace: string;
  rule: LintRule;
  // Effective: the configured setting, or the rule's default severity.
  setting: RuleSetting;
}

export interface RuleSet {
  // For run.plugins: sorted by name, sdc included, lint excluded.
  pluginVersions: PackageVersion[];
  // Sorted by ID, including rules configured off and lint/stale-suppression.
  rules: ResolvedRule[];
}

// The two halves of the report schema's rule ID pattern.
const namePattern = /^[a-z][a-z0-9-]*$/;
const severities: readonly string[] = ['error', 'warning', 'info'];
const docsFields = ['checks', 'why', 'exampleMessage', 'fix', 'limitations'] as const;

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// Help for an unknown rule ID, shared by config failures and explain.
export function unknownRuleHelp(id: string, ruleSet: RuleSet): string {
  const similar = closestName(
    id,
    ruleSet.rules.map((rule) => rule.id),
  );
  if (similar !== undefined) return `a rule with a similar name exists: ${similar}`;
  const slash = id.indexOf('/');
  const namespace = id.slice(0, slash);
  const registered = [
    ...ruleSet.pluginVersions.map(({ name }) => name),
    ...ruleSet.rules.map(({ namespace }) => namespace),
  ];
  if (slash > 0 && !registered.includes(namespace)) {
    return `the plugin providing ${namespace}/ rules must be listed in plugins in an .mjs config`;
  }
  return 'run sdc-lint explain to list the registered rules';
}

// Checks the shape of the plugin at plugins/<index>; a failure points into the exported config.
function validatePlugin(value: unknown, index: number, display: string): LintPlugin {
  const fail = (at: (string | number)[], problem: string, help: string): never => {
    throw invalidConfigFailure(display, ['plugins', index, ...at], problem, help);
  };
  const plugin = isObject(value)
    ? value
    : fail([], 'expected a plugin object', "list the plugin's default export: plugins: [myPlugin]");
  const meta = isObject(plugin.meta)
    ? plugin.meta
    : fail(['meta'], 'the plugin has no meta object', 'give the plugin meta: { name, version }');
  if (typeof meta.name !== 'string' || !namePattern.test(meta.name)) {
    fail(
      ['meta', 'name'],
      'the plugin name is not a lowercase name such as smart-forms',
      'set meta.name to the rule namespace, in lowercase letters, digits and hyphens',
    );
  }
  if (typeof meta.version !== 'string' || meta.version === '') {
    fail(['meta', 'version'], 'the plugin has no version', 'set meta.version to its version');
  }
  const rules = isObject(plugin.rules)
    ? plugin.rules
    : fail(['rules'], 'the plugin has no rules object', 'give the plugin rules keyed by name');
  for (const [key, rule] of Object.entries(rules)) {
    const at = ['rules', key];
    if (!namePattern.test(key)) {
      fail(
        at,
        `rule key ${key} is not a lowercase name such as no-today`,
        'rename the rule key; its ID is <meta.name>/<key>',
      );
    }
    if (!isObject(rule)) return fail(at, 'expected a rule object', 'give the rule meta and check');
    const ruleMeta = isObject(rule.meta)
      ? rule.meta
      : fail(
          [...at, 'meta'],
          'the rule has no meta object',
          'give the rule meta: { description, defaultSeverity }',
        );
    if (typeof ruleMeta.description !== 'string' || ruleMeta.description === '') {
      fail(
        [...at, 'meta', 'description'],
        'the rule has no description',
        'describe what the rule checks in one line',
      );
    }
    if (
      typeof ruleMeta.defaultSeverity !== 'string' ||
      !severities.includes(ruleMeta.defaultSeverity)
    ) {
      fail(
        [...at, 'meta', 'defaultSeverity'],
        'the default severity is not error, warning or info',
        'set meta.defaultSeverity to error, warning or info',
      );
    }
    const { docsUrl, docs } = ruleMeta;
    if (docsUrl !== undefined && (typeof docsUrl !== 'string' || !URL.canParse(docsUrl))) {
      fail(
        [...at, 'meta', 'docsUrl'],
        'docsUrl is not an absolute URL',
        'set meta.docsUrl to an absolute URL, such as https://example.org/rules/no-today',
      );
    }
    if (docs !== undefined) {
      const fields = `give docs the non-empty fields ${docsFields.join(', ')}`;
      const record = isObject(docs)
        ? docs
        : fail([...at, 'meta', 'docs'], 'the rule docs are not an object', fields);
      for (const field of docsFields) {
        if (typeof record[field] !== 'string' || record[field] === '') {
          fail([...at, 'meta', 'docs', field], `the rule docs have no ${field} text`, fields);
        }
      }
    }
    if (typeof rule.check !== 'function') {
      fail([...at, 'check'], 'the rule has no check function', 'give the rule a check(ctx)');
    }
  }
  return value as LintPlugin;
}

// The built-in sdc and lint plugins and the config's plugins, with the config's settings
// applied. Also checks the rule IDs the config's rules and suppress name, so lint and explain
// fail the same way before any input is read.
export function resolveRuleSet(loaded: LoadedConfig | null): RuleSet {
  const config = loaded?.config ?? {};
  const display = loaded?.display ?? '';
  const fail = (at: (string | number)[], problem: string, help: string): never => {
    throw invalidConfigFailure(display, at, problem, help);
  };

  const plugins = [sdcPlugin, lintPlugin];
  (config.plugins ?? []).forEach((value: unknown, index) => {
    const plugin = validatePlugin(value, index, display);
    const { name } = plugin.meta;
    const at = ['plugins', index, 'meta', 'name'];
    if (name === sdcPlugin.meta.name || name === lintPlugin.meta.name) {
      fail(at, `the namespace ${name} is reserved`, 'give the plugin another meta.name');
    }
    if (plugins.some(({ meta }) => meta.name === name)) {
      fail(
        at,
        `the namespace ${name} is already registered`,
        'list each plugin once, and give each plugin its own meta.name',
      );
    }
    plugins.push(plugin);
  });

  const settings = config.rules ?? {};
  const ruleSet: RuleSet = {
    pluginVersions: plugins
      .filter((plugin) => plugin !== lintPlugin)
      .map(({ meta }) => ({ name: meta.name, version: meta.version }))
      .sort((a, b) => compareStrings(a.name, b.name)),
    rules: plugins
      .flatMap(({ meta, rules }) =>
        Object.entries(rules).map(([key, rule]) => {
          const id = `${meta.name}/${key}`;
          return {
            id,
            namespace: meta.name,
            rule,
            setting: settings[id] ?? rule.meta.defaultSeverity,
          };
        }),
      )
      .sort((a, b) => compareStrings(a.id, b.id)),
  };

  const ruleIds: string[] = ruleSet.rules.map(({ id }) => id);
  for (const [id, setting] of Object.entries(settings)) {
    if (!ruleIds.includes(id)) {
      fail(['rules', id], `unknown rule ${id}`, unknownRuleHelp(id, ruleSet));
    }
    // Its severity is fixed until --strict-suppressions (cli.md § Stale suppressions).
    if (id === staleSuppressionId && setting !== 'warning' && setting !== 'off') {
      fail(['rules', id], `${id} can only be warning or off`, `set ${id} to warning or off`);
    }
  }
  (config.suppress ?? []).forEach(({ rule }, index) => {
    const at = ['suppress', index, 'rule'];
    if (rule.startsWith('lint/')) {
      fail(at, `${rule} findings cannot be suppressed`, `set ${rule} to off in rules instead`);
    }
    if (!ruleIds.includes(rule)) fail(at, `unknown rule ${rule}`, unknownRuleHelp(rule, ruleSet));
  });
  return ruleSet;
}
