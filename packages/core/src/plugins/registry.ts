import type { LoadedConfig } from '../config/load.js';
import { configInvalid } from '../config/validate.js';
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

// Every built-in rule with the config's settings applied, sorted by ID.
export function registerRules(loaded: LoadedConfig | null): RegisteredRule[] {
  const settings = loaded?.config.rules ?? {};
  const rules = Object.entries(sdcPlugin.rules)
    .map(([name, rule]) => {
      const id = `${sdcPlugin.meta.name}/${name}`;
      return { id, rule, severity: settings[id] ?? rule.meta.defaultSeverity };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  if (loaded === null) return rules;
  const ruleIds = rules.map(({ id }) => id);
  for (const id of Object.keys(settings)) {
    if (!ruleIds.includes(id)) {
      throw configInvalid(
        loaded.display,
        ['rules', id],
        `unknown rule ${id}`,
        unknownRuleHelp(id, ruleIds),
      );
    }
  }
  return rules;
}
