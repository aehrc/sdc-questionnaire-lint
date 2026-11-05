/*
 * Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
 * (CSIRO) ABN 41 687 119 230. Licensed under the Apache License, Version 2.0.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { lintPlugin, sdcPlugin } from '../../packages/core/src/plugins/builtin.js';
import type { LintPlugin, LintRule } from '../../packages/core/src/plugins/contract.js';
import {
  compileLintCases,
  readLintCases,
  type LintCase,
} from '../../packages/lint-cases/src/project.js';
import smartForms from '../../packages/plugin-smart-forms/src/index.js';

// The rules library: a page per rule (docs/rules/[plugin]/[rule].md), generated from the rule's
// meta.docs and its example lint case compiled by SUSHI, so the pages follow the code. Loading it
// needs the built core, which the Smart Forms plugin imports.

export const repository = 'https://github.com/aehrc/sdc-questionnaire-lint';
const root = fileURLToPath(new URL('../../', import.meta.url));

// A repository file or directory on GitHub.
export const repositoryUrl = (file: string): string => `${repository}/blob/main/${file}`;

// The lint case each rule's page shows as its example, <group>/<case>: a case whose expected
// findings include the rule. A rule that reports on the linter config has no lint case, so its
// page explains that instead. A new rule needs an entry.
const examples: Readonly<Record<string, { case: string } | 'config'>> = {
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
  'lint/stale-suppression': 'config',
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
  'smart-forms/forward-variable-reference': { case: 'forward-variable-reference/root-later' },
  'smart-forms/unsupported-template-extract-context': {
    case: 'unsupported-template-extract-context/fhirpath-context',
  },
};

interface RuleGroup {
  id: string;
  title: string;
  // The package that holds the rules, relative to the repository root.
  packageDirectory: string;
  plugins: readonly LintPlugin[];
  // The plugin files the package's lint cases list, as its test/cases/cases.test.ts passes them;
  // the same files give the same compiled project as the tests.
  casePlugins: readonly string[];
}

const groups: readonly RuleGroup[] = [
  {
    id: 'core',
    title: 'Core rules',
    packageDirectory: 'packages/core',
    plugins: [sdcPlugin, lintPlugin],
    casePlugins: [],
  },
  {
    id: 'smart-forms',
    title: 'Smart Forms rules',
    packageDirectory: 'packages/plugin-smart-forms',
    plugins: [smartForms],
    casePlugins: [path.join(root, 'packages/plugin-smart-forms/src/index.ts')],
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

const badgeType: Readonly<Record<string, string>> = {
  error: 'danger',
  warning: 'warning',
  info: 'info',
};

interface ExpectedFinding {
  ruleId: string;
  // <file>:<line>:<column>
  at: string;
}

const readFindings = (file: string): ExpectedFinding[] =>
  (parse(readFileSync(file, 'utf8')) as ExpectedFinding[] | null) ?? [];

interface CompiledCases {
  cases: LintCase[];
  project: () => string;
}

function exampleSection(
  entry: RuleEntry,
  compiled: CompiledCases,
  example: { case: string } | 'config',
): string[] {
  const { id, rule } = entry;
  const exampleMessage = rule.meta.docs?.exampleMessage;
  if (example === 'config') {
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
  const fsh = `input/fsh/${lintCase.config.instance}.fsh`;
  const findings = readFindings(lintCase.expectedPath).filter(({ ruleId }) => ruleId === id);
  if (findings.length === 0) {
    throw new Error(`${id}: the expected findings of ${example.case} do not include it`);
  }
  // The FSH lines the rule's findings point at, highlighted. An unmapped finding has none.
  const lines = new Set(
    findings
      .map(({ at }) => at.split(':'))
      .filter(([file]) => file === fsh)
      .map(([, line]) => line),
  );
  const highlight = lines.size === 0 ? '' : ` {${[...lines].join(',')}}`;
  return [
    '## Example',
    '',
    ...(exampleMessage === undefined ? [] : [`> ${text(exampleMessage)}`, '']),
    `\`\`\`fsh:line-numbers${highlight}`,
    readFileSync(path.join(compiled.project(), fsh), 'utf8').trimEnd(),
    '```',
  ];
}

function rulePage(
  entry: RuleEntry,
  compiled: CompiledCases,
): { params: { plugin: string; rule: string }; content: string } {
  const { id, rule } = entry;
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
    ...exampleSection(entry, compiled, example),
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
    return rules.map((entry) => rulePage(entry, compiled));
  });
}
