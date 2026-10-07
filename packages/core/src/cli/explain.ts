import { type LoadedConfig, loadConfig } from '../config/load.js';
import { asLintFailure, LintFailure, renderFailureText } from '../failure.js';
import {
  buildRuleRegistry,
  type RegisteredRule,
  unknownRuleHelp,
} from '../plugins/rule-registry.js';
import { guardStdout } from './output-guard.js';
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
  { id, plugin, rule, severity }: RegisteredRule,
  loaded: LoadedConfig | null,
): string {
  const { description, defaultSeverity, docsUrl, docs } = rule.meta;
  const lines = [
    id,
    description,
    '',
    `Default severity: ${defaultSeverity}. Effective severity: ${severity}.`,
  ];
  if (docsUrl !== undefined) lines.push(`Documentation: ${docsUrl}`);
  // Every built-in rule has docs (test/plugins/docs.test.ts); a plugin rule may have none.
  if (docs === undefined) {
    lines.push('', `The ${plugin} plugin ships no bundled documentation for this rule.`);
  } else {
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

// The listing, or the named rule's documentation.
async function explain(
  args: { ruleId?: string; configPath?: string },
  cwd: string,
): Promise<string> {
  const loaded = await loadConfig({
    cwd,
    ...(args.configPath === undefined ? {} : { explicitPath: args.configPath }),
  });
  const registry = buildRuleRegistry(loaded);
  const { ruleId } = args;
  if (ruleId === undefined) return formatRuleList(registry.rules, loaded);
  const rule = registry.rules.find(({ id }) => id === ruleId);
  if (rule === undefined) {
    throw new LintFailure({
      code: 'USAGE_ERROR',
      message: `unknown rule ${ruleId}`,
      help: unknownRuleHelp(ruleId, registry),
    });
  }
  return formatRuleDocs(rule, loaded);
}

// Loads the config and registers rules as lint does, but never collects inputs or runs rules.
// Output is text only; failures go to stderr.
export async function runExplain(
  args: { ruleId?: string; configPath?: string },
  io: CliIo,
): Promise<0 | 2> {
  try {
    let text: string;
    // Loading an .mjs config runs its code; the output is written once the guard is off.
    const restore = guardStdout(io.stderr);
    try {
      text = await explain(args, io.cwd);
    } finally {
      restore();
    }
    io.stdout.write(text);
    return 0;
  } catch (error) {
    io.stderr.write(renderFailureText(asLintFailure(error)));
    return 2;
  }
}
