import { type LoadedConfig, loadConfig } from '../config/load.js';
import { asLintFailure, LintFailure, renderFailureText } from '../failure.js';
import { type RegisteredRule, registerRules, unknownRuleHelp } from '../plugins/registry.js';
import type { CliIo } from './run.js';

function configLine(loaded: LoadedConfig | null): string {
  return `Config: ${loaded?.display ?? 'none, built-in defaults'}.`;
}

// One aligned row per registered rule, including rules configured off. EFFECTIVE reads off for a
// rule that does not run, so it carries the enabled status too.
function formatRuleList(rules: readonly RegisteredRule[], loaded: LoadedConfig | null): string {
  const rows = [
    ['RULE', 'DEFAULT', 'EFFECTIVE', 'DESCRIPTION'],
    ...rules.map(({ id, rule, severity }) => [
      id,
      rule.meta.defaultSeverity,
      severity,
      rule.meta.description,
    ]),
  ];
  const widths = [0, 1, 2].map((column) =>
    Math.max(...rows.map((row) => row[column]?.length ?? 0)),
  );
  const table = rows.map((row) =>
    row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join('  '),
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

function formatRuleDocs(
  { id, rule, severity }: RegisteredRule,
  loaded: LoadedConfig | null,
): string {
  const { description, defaultSeverity, docs } = rule.meta;
  const lines = [
    id,
    description,
    '',
    `Default severity: ${defaultSeverity}. Effective severity: ${severity}.`,
  ];
  // Every built-in rule has docs (test/plugins/docs.test.ts); plugin rules arrive with plugins.
  if (docs !== undefined) {
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

// Loads the config and registers rules as lint does, but never collects inputs or runs rules.
// Output is text only; failures go to stderr.
export async function runExplain(
  args: { ruleId?: string; configPath?: string },
  io: CliIo,
): Promise<0 | 2> {
  try {
    const loaded = await loadConfig({
      cwd: io.cwd,
      ...(args.configPath === undefined ? {} : { explicitPath: args.configPath }),
    });
    const rules = registerRules(loaded);
    const { ruleId } = args;
    if (ruleId === undefined) {
      io.stdout.write(formatRuleList(rules, loaded));
      return 0;
    }
    const rule = rules.find(({ id }) => id === ruleId);
    if (rule === undefined) {
      throw new LintFailure({
        code: 'USAGE_ERROR',
        message: `unknown rule ${ruleId}`,
        help: unknownRuleHelp(
          ruleId,
          rules.map(({ id }) => id),
        ),
      });
    }
    io.stdout.write(formatRuleDocs(rule, loaded));
    return 0;
  } catch (error) {
    io.stderr.write(renderFailureText(asLintFailure(error)));
    return 2;
  }
}
