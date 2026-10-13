import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { lintPlugin, sdcPlugin } from '../../packages/core/src/plugins/builtin.js';
import type { LintPlugin, LintRule } from '../../packages/core/src/plugins/contract.js';
import type { FshConfig } from '../../packages/lint-cases/src/generate-fsh.js';
import {
  compileLintCases,
  readLintCases,
  type LintCase,
} from '../../packages/lint-cases/src/project.js';
import smartForms from '../../packages/plugin-smart-forms/src/index.js';

// The rules library: a page per rule (docs/rules/[plugin]/[rule].md), generated from the rule's
// meta.docs, its example lint case compiled by SUSHI, and its lint cases, so the pages follow the
// code. Loading it needs the built core, which the Smart Forms plugin imports.

export const repository = 'https://github.com/beda-software/sdc-questionnaire-lint';
const root = fileURLToPath(new URL('../../', import.meta.url));

// A repository file or directory on GitHub.
export const repositoryUrl = (file: string): string => `${repository}/blob/main/${file}`;

// The lint case each rule's page shows as its example, <group>/<case>: a case whose expected
// findings include the rule. A rule that reports on the linter config has no lint case, so its
// page names the test files that cover it instead. A new rule needs an entry.
const examples: Readonly<Record<string, { case: string } | { tests: readonly string[] }>> = {
  'sdc/dependency-cycle': { case: 'dependency-cycle/two-variables' },
  'sdc/duplicate-declaration': { case: 'duplicate-declaration/variables-on-item' },
  'sdc/external-expression': { case: 'external-expression/reference-only' },
  'sdc/fragment-parse-error': { case: 'fragment-parse-error/broken' },
  'sdc/language-not-allowed': { case: 'language-not-allowed/enable-when-query' },
  'sdc/language-not-in-value-set': { case: 'language-not-in-value-set/similar-code' },
  'sdc/parse-error': { case: 'parse-error/messages' },
  'sdc/query-syntax': { case: 'query-syntax/not-a-search' },
  'sdc/reserved-name': { case: 'reserved-name/variable' },
  'sdc/shadowed-declaration': { case: 'shadowed-declaration/root-and-item' },
  'sdc/uncatalogued-expression': { case: 'uncatalogued-expression/query-once' },
  'sdc/undefined-variable': { case: 'undefined-variable/similar-name' },
  'sdc/unknown-function': { case: 'unknown-function/similar-name' },
  'sdc/unresolved-linkid': { case: 'unresolved-linkid/similar' },
  'sdc/unused-declaration': { case: 'unused-declaration/unreferenced' },
  'lint/stale-suppression': { tests: ['packages/core/test/run/suppressions.test.ts'] },
  'smart-forms/unsupported-expression-language': {
    case: 'unsupported-expression-language/expression-kinds',
  },
  'smart-forms/expression-evaluated-as-fhirpath': {
    case: 'expression-evaluated-as-fhirpath/query-population-context',
  },
  'smart-forms/questionnaire-variable-unavailable': {
    case: 'questionnaire-variable-unavailable/variables',
  },
  'smart-forms/unsupported-query-embedding': {
    case: 'unsupported-query-embedding/not-launch-context',
  },
  'smart-forms/variable-name-collision': { case: 'variable-name-collision/siblings' },
  'smart-forms/repeating-group-variable': { case: 'repeating-group-variable/reads-input' },
  'smart-forms/named-expression-not-referenceable': {
    case: 'named-expression-not-referenceable/calculated-expression',
  },
};

interface RuleGroup {
  id: string;
  title: string;
  // The package that holds the rules, relative to the repository root.
  packageDirectory: string;
  plugins: readonly LintPlugin[];
  // The file that registers the plugins' rules.
  registration: string;
  // The plugin files the package's lint cases list, as its test/cases/cases.test.ts passes them;
  // the same files give the same compiled project as the tests.
  casePlugins: readonly string[];
  // The linter config a lint case of the group is linted with, or undefined for the defaults.
  config: (config: FshConfig) => CodeFile | undefined;
}

interface CodeFile {
  name: string;
  language: string;
  text: string;
}

// The settings a lint case gives for its linter config.
function caseSettings({ hostVariables, rules, suppress }: FshConfig): Record<string, unknown> {
  return {
    ...(hostVariables === undefined ? {} : { hostVariables }),
    ...(rules === undefined ? {} : { rules }),
    ...(suppress === undefined ? {} : { suppress }),
  };
}

const groups: readonly RuleGroup[] = [
  {
    id: 'core',
    title: 'Core rules',
    packageDirectory: 'packages/core',
    plugins: [sdcPlugin, lintPlugin],
    registration: 'packages/core/src/plugins/builtin.ts',
    casePlugins: [],
    config(config) {
      const settings = caseSettings(config);
      if (Object.keys(settings).length === 0) return undefined;
      return {
        name: 'sdc-questionnaire-lint.config.json',
        language: 'json',
        text: JSON.stringify(settings, null, 2),
      };
    },
  },
  {
    id: 'smart-forms',
    title: 'Smart Forms rules',
    packageDirectory: 'packages/plugin-smart-forms',
    plugins: [smartForms],
    registration: 'packages/plugin-smart-forms/src/index.ts',
    casePlugins: [path.join(root, 'packages/plugin-smart-forms/src/index.ts')],
    config(config) {
      const settings = Object.entries(caseSettings(config)).map(
        ([key, value]) => `  ${key}: ${JSON.stringify(value)},`,
      );
      return {
        name: 'sdc-questionnaire-lint.config.mjs',
        language: 'js',
        text: [
          "import { defineConfig } from 'sdc-questionnaire-lint';",
          "import smartForms from '@sdc-questionnaire-lint/plugin-smart-forms';",
          '',
          'export default defineConfig({',
          '  plugins: [smartForms],',
          ...settings,
          '});',
        ].join('\n'),
      };
    },
  },
];

export interface RuleEntry {
  // <plugin>/<name>, the rule ID.
  id: string;
  plugin: string;
  name: string;
  // The rule's page.
  link: string;
  rule: LintRule;
  // The rule's source file, relative to the repository root.
  source: string;
}

export interface RuleGroupEntry {
  group: RuleGroup;
  rules: RuleEntry[];
}

// Every rule by group, in registration order.
export function ruleLibrary(): RuleGroupEntry[] {
  return groups.map((group) => ({
    group,
    rules: group.plugins.flatMap((plugin) =>
      Object.entries(plugin.rules).map(([name, rule]) => {
        const id = `${plugin.meta.name}/${name}`;
        const source = `${group.packageDirectory}/src/rules/${name}.ts`;
        if (!existsSync(path.join(root, source))) throw new Error(`${id}: ${source} is missing`);
        return { id, plugin: plugin.meta.name, name, link: `/docs/rules/${id}`, rule, source };
      }),
    ),
  }));
}

export interface RuleSummary {
  id: string;
  link: string;
  severity: string;
  description: string;
}

// The rules of each group, for the library's index page.
export function ruleSummaries(): Record<string, RuleSummary[]> {
  return Object.fromEntries(
    ruleLibrary().map(({ group, rules }) => [
      group.id,
      rules.map(({ id, link, rule }) => ({
        id,
        link,
        severity: rule.meta.defaultSeverity,
        description: rule.meta.description,
      })),
    ]),
  );
}

// Plain text as Markdown: every character Markdown or Vue could read as syntax is escaped.
const text = (value: string): string => value.replace(/[\\`*_[\]<>|{}#&~]/g, '\\$&');

const fence = ({ name, language, text: code }: CodeFile, numbered = false): string =>
  [`\`\`\`${language}${numbered ? ':line-numbers' : ''} [${name}]`, code.trimEnd(), '```'].join(
    '\n',
  );

const badgeType: Readonly<Record<string, string>> = {
  error: 'danger',
  warning: 'warning',
  info: 'info',
};

interface ExpectedFinding {
  ruleId: string;
  message: string;
}

const readFindings = (file: string): ExpectedFinding[] =>
  (parse(readFileSync(file, 'utf8')) as ExpectedFinding[] | null) ?? [];

// A case's leading comment, which says what it covers.
function caseComment(configPath: string): string {
  const comment: string[] = [];
  for (const line of readFileSync(configPath, 'utf8').split('\n')) {
    if (!line.startsWith('#')) break;
    comment.push(line.replace(/^#\s?/, ''));
  }
  return comment.join(' ');
}

const relative = (file: string): string => path.relative(root, file).split(path.sep).join('/');

interface CompiledCases {
  cases: LintCase[];
  project: () => string;
}

function exampleSection(
  entry: RuleEntry,
  group: RuleGroup,
  compiled: CompiledCases,
  example: { case: string } | { tests: readonly string[] },
): string[] {
  const { id, rule } = entry;
  const exampleMessage = rule.meta.docs?.exampleMessage;
  if ('tests' in example) {
    return [
      '## Example',
      '',
      ...(exampleMessage === undefined ? [] : [`> ${text(exampleMessage)}`, '']),
      'This rule reports on the suppressions in the linter config, not on a form, so it has no ' +
        'lint case. [Stale suppressions](../../cli.md#stale-suppressions) describes when an ' +
        'entry is stale, and the [example report](../../examples/reports/README.md) has a ' +
        'stale-suppression finding.',
    ];
  }
  const lintCase = compiled.cases.find(({ name }) => name === example.case);
  if (lintCase === undefined) throw new Error(`${id}: no lint case ${example.case}`);
  const findings = readFindings(lintCase.expectedPath).filter(({ ruleId }) => ruleId === id);
  if (findings.length === 0) {
    throw new Error(`${id}: the expected findings of ${example.case} do not include it`);
  }
  const { instance } = lintCase.config;
  const project = compiled.project();
  const fsh = `input/fsh/${instance}.fsh`;
  const json = `fsh-generated/resources/Questionnaire-${instance}.json`;
  const config = group.config(lintCase.config);
  return [
    '## Example',
    '',
    // The example message is shown when the example form does not produce it.
    ...(exampleMessage === undefined || findings.some(({ message }) => message === exampleMessage)
      ? []
      : [`> ${text(exampleMessage)}`, '']),
    `The lint case [${text(example.case)}](${repositoryUrl(relative(lintCase.configPath))}): ` +
      `${text(caseComment(lintCase.configPath))} Its FSH, the Questionnaire SUSHI compiles from ` +
      'it' +
      (config === undefined ? '' : ', and the linter config it is linted with') +
      ':',
    '',
    '::: code-group',
    '',
    fence(
      {
        name: `${instance}.fsh`,
        language: 'fsh',
        text: readFileSync(path.join(project, fsh), 'utf8'),
      },
      true,
    ),
    '',
    fence({
      name: `Questionnaire-${instance}.json`,
      language: 'json',
      text: readFileSync(path.join(project, json), 'utf8'),
    }),
    ...(config === undefined ? [] : ['', fence(config)]),
    '',
    ':::',
    '',
    `The ${findings.length === 1 ? 'finding' : 'findings'} of \`${id}\`, as the case's ` +
      `[expected file](${repositoryUrl(relative(lintCase.expectedPath))}) holds them; \`at\` ` +
      'is the FSH file, line and column:',
    '',
    fence({
      name: 'Findings',
      language: 'yaml',
      text: stringify(findings, { lineWidth: 0, singleQuote: true }),
    }),
  ];
}

function testSection(
  entry: RuleEntry,
  group: RuleGroup,
  compiled: CompiledCases,
  example: { case: string } | { tests: readonly string[] },
): string[] {
  const runner = `${group.packageDirectory}/test/cases/cases.test.ts`;
  if ('tests' in example) {
    return [
      '## Tests',
      '',
      ...example.tests.map((file) => `- [${file}](${repositoryUrl(file)})`),
    ];
  }
  const own = compiled.cases.filter(({ name }) => name.startsWith(`${entry.name}/`));
  return [
    '## Test cases',
    '',
    `Each lint case is a form in YAML beside the findings the linter must report for it, in ` +
      `[${group.packageDirectory}/test/cases/${entry.name}](` +
      `${repositoryUrl(`${group.packageDirectory}/test/cases/${entry.name}`)}). ` +
      `[cases.test.ts](${repositoryUrl(runner)}) compiles them with SUSHI and lints them. A ` +
      'case without findings of this rule shows a form it must not report.',
    '',
    `| Case | What it covers | Findings of \`${entry.id}\` |`,
    '| :- | :- | :- |',
    ...own.map((lintCase) => {
      const count = readFindings(lintCase.expectedPath).filter(
        ({ ruleId }) => ruleId === entry.id,
      ).length;
      return (
        `| [${text(lintCase.name.slice(entry.name.length + 1))}](` +
        `${repositoryUrl(relative(lintCase.configPath))}) ` +
        `| ${text(caseComment(lintCase.configPath))} ` +
        `| [${count === 0 ? 'none' : String(count)}](${repositoryUrl(relative(lintCase.expectedPath))}) |`
      );
    }),
  ];
}

function rulePage(
  entry: RuleEntry,
  group: RuleGroup,
  compiled: CompiledCases,
): { params: { plugin: string; rule: string }; content: string } {
  const { id, rule, source } = entry;
  const example = examples[id];
  if (example === undefined) {
    throw new Error(`${id}: give it an example in docs/.vitepress/rules.ts`);
  }
  const { docs } = rule.meta;
  if (docs === undefined) throw new Error(`${id}: meta.docs is missing`);
  const severity = rule.meta.defaultSeverity;
  const content = [
    `# ${id}`,
    '',
    `<Badge type="${badgeType[severity] ?? 'info'}" text="${severity}" /> ${text(rule.meta.description)}`,
    '',
    '## What it checks',
    '',
    text(docs.checks),
    '',
    '## Why it matters',
    '',
    text(docs.why),
    '',
    ...exampleSection(entry, group, compiled, example),
    '',
    '## How to fix it',
    '',
    text(docs.fix),
    '',
    '## Known limitations',
    '',
    text(docs.limitations),
    '',
    ...testSection(entry, group, compiled, example),
    '',
    '## Implementation',
    '',
    `- The rule: [${source}](${repositoryUrl(source)})`,
    `- Registered in [${group.registration}](${repositoryUrl(group.registration)})`,
    `- \`sdc-lint explain ${id}\` prints the documentation on this page, without the example ` +
      'and the tests.',
    '',
  ].join('\n');
  return { params: { plugin: entry.plugin, rule: entry.name }, content };
}

// The rule pages, for docs/rules/[plugin]/[rule].paths.ts. Compiles each package's lint cases with
// SUSHI, or reuses the project the tests compiled. Throws when a rule has no usable example, so
// the build fails.
export function rulePages(): { params: { plugin: string; rule: string }; content: string }[] {
  const library = ruleLibrary();
  const ids = new Set(library.flatMap(({ rules }) => rules.map(({ id }) => id)));
  const unknown = Object.keys(examples).filter((id) => !ids.has(id));
  if (unknown.length > 0) {
    throw new Error(`docs/.vitepress/rules.ts gives examples of unknown rules: ${unknown.join(', ')}`);
  }
  return library.flatMap(({ group, rules }) => {
    const casesDirectory = path.join(root, group.packageDirectory, 'test', 'cases');
    const cases = readLintCases(casesDirectory);
    let project: string | undefined;
    const compiled: CompiledCases = {
      cases,
      project: () => (project ??= compileLintCases(casesDirectory, cases, group.casePlugins)),
    };
    return rules.map((entry) => rulePage(entry, group, compiled));
  });
}
