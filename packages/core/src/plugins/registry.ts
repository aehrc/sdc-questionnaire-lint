import type { LoadedConfig } from '../config/load.js';
import { configInvalid } from '../config/validate.js';
import { staleSuppression } from '../rules/stale-suppression.js';
import { closestName } from '../suggest.js';
import { sdcPlugin } from './builtin.js';
import type { LintRule, Severity } from './types.js';

export interface RegisteredRule {
  // sdc/parse-error
  id: string;
  rule: LintRule;
  // Effective: the configured setting, or the rule's default severity.
  severity: Severity | 'off';
}

// Help for an unknown rule ID, shared by config failures and explain.
export function unknownRuleHelp(id: string, ruleIds: readonly string[]): string {
  const similar = closestName(id, ruleIds);
  return similar === undefined
    ? 'run sdc-lint explain to list the registered rules'
    : `a rule with a similar name exists: ${similar}`;
}

export const staleSuppressionId = 'lint/stale-suppression';

// Every built-in rule with the config's settings applied, sorted by ID, and lint/stale-suppression,
// whose findings come from the suppression assessment. Also checks the rule IDs the config's
// rules and suppress name, so lint and explain fail the same way before any input is read.
export function registerRules(loaded: LoadedConfig | null): RegisteredRule[] {
  const settings = loaded?.config.rules ?? {};
  const rules = [
    ...Object.entries(sdcPlugin.rules).map(
      ([name, rule]) => [`${sdcPlugin.meta.name}/${name}`, rule] as const,
    ),
    [staleSuppressionId, staleSuppression] as const,
  ]
    .map(([id, rule]) => ({ id, rule, severity: settings[id] ?? rule.meta.defaultSeverity }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  if (loaded === null) return rules;
  const fail = (at: (string | number)[], problem: string, help: string): never => {
    throw configInvalid(loaded.display, at, problem, help);
  };
  const ruleIds: string[] = rules.map(({ id }) => id);
  for (const [id, setting] of Object.entries(settings)) {
    if (!ruleIds.includes(id)) {
      fail(['rules', id], `unknown rule ${id}`, unknownRuleHelp(id, ruleIds));
    }
    // Its severity is fixed until --strict-suppressions (cli.md § Stale suppressions).
    if (id === staleSuppressionId && setting !== 'warning' && setting !== 'off') {
      fail(['rules', id], `${id} can only be warning or off`, `set ${id} to warning or off`);
    }
  }
  (loaded.config.suppress ?? []).forEach(({ rule }, index) => {
    const at = ['suppress', index, 'rule'];
    if (rule.startsWith('lint/')) {
      fail(at, `${rule} findings cannot be suppressed`, `set ${rule} to off in rules instead`);
    }
    if (!ruleIds.includes(rule)) fail(at, `unknown rule ${rule}`, unknownRuleHelp(rule, ruleIds));
  });
  return rules;
}
