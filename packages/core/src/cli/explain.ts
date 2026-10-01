import { selectConfig } from '../config/discover.js';
import { type LoadedConfig, loadConfig } from '../config/load.js';
import { asLintFailure, LintFailure, renderFailureText } from '../failure.js';
import {
  buildRegistry,
  type RegisteredRule,
  type Registry,
  unknownRuleHelp,
} from '../plugins/registry.js';
import type { CliIo } from './run.js';

function configLine(loaded: LoadedConfig | null): string {
  return `Config: ${loaded?.display ?? 'none, built-in defaults'}.`;
}

function status(rule: RegisteredRule): string {
  return rule.enabled ? 'enabled' : 'disabled';
}

// One aligned row per registered rule, including rules configured off, sorted by ID.
export function formatRuleList(registry: Registry, loaded: LoadedConfig | null): string {
  const rows = [
    ['RULE', 'DEFAULT', 'EFFECTIVE', 'STATUS', 'DESCRIPTION'],
    ...registry.rules.map((rule) => [
      rule.id,
      rule.defaultSeverity,
      rule.effectiveSeverity,
      status(rule),
      rule.description,
    ]),
  ];
  const widths = rows[0]?.map((_, column) =>
    Math.max(...rows.map((row) => (row[column] ?? '').length)),
  );
  const table = rows.map((row) =>
    row
      .map((cell, column) =>
        column === row.length - 1 ? cell : cell.padEnd(widths?.[column] ?? 0),
      )
      .join('  '),
  );
  return [
    ...table,
    '',
    configLine(loaded),
    "Run sdc-lint explain <rule-id> for a rule's documentation.",
    '',
  ].join('\n');
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

// A rule's bundled documentation: what it checks, why, an example message, the fix, limitations.
export function formatRuleDocs(rule: RegisteredRule, loaded: LoadedConfig | null): string {
  const lines = [
    rule.id,
    rule.description,
    '',
    `Default severity: ${rule.defaultSeverity}. Effective severity: ${rule.effectiveSeverity} (${status(rule)}).`,
  ];
  if (rule.docsUrl !== undefined) lines.push(`Documentation: ${rule.docsUrl}`);
  if (rule.docs === undefined) {
    lines.push('', `The ${rule.plugin} plugin ships no bundled documentation for this rule.`);
  } else {
    const { docs } = rule;
    for (const [heading, text] of [
      ['What it checks', docs.checks],
      ['Why it matters', docs.why],
      ['Example message', docs.exampleMessage],
      ['How to fix it', docs.fix],
      ['Known limitations', docs.limitations],
    ] as const) {
      lines.push('', heading, indent(text));
    }
  }
  lines.push('', configLine(loaded), '');
  return lines.join('\n');
}

// Loads the config and its plugins like lint, but never reads inputs or runs rules. Output is
// text only; failures go to stderr.
export async function runExplain(
  args: { ruleId?: string; configPath?: string },
  io: CliIo,
): Promise<0 | 2> {
  try {
    const selected = await selectConfig({
      cwd: io.cwd,
      ...(args.configPath === undefined ? {} : { explicitPath: args.configPath }),
    });
    const loaded = selected === null ? null : await loadConfig(selected);
    const registry = buildRegistry(loaded);
    if (args.ruleId === undefined) {
      io.stdout.write(formatRuleList(registry, loaded));
      return 0;
    }
    const { ruleId } = args;
    const rule = registry.rules.find((registered) => registered.id === ruleId);
    if (rule === undefined) {
      const ruleIds = registry.rules.map((registered) => registered.id);
      throw new LintFailure({
        code: 'USAGE_ERROR',
        message: `unknown rule ${ruleId}`,
        help: unknownRuleHelp(ruleId, ruleIds, registry.namespaces),
      });
    }
    io.stdout.write(formatRuleDocs(rule, loaded));
    return 0;
  } catch (error) {
    io.stderr.write(renderFailureText(asLintFailure(error)));
    return 2;
  }
}
