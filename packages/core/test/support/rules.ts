import { analyseDocument } from '../../src/analysis/document-analysis.js';
import type { ExpressionSite, QuestionnaireDocument } from '../../src/analysis/expression-site.js';
import { findExpressionSites } from '../../src/analysis/expression-sites.js';
import { sdcPlugin } from '../../src/plugins/builtin.js';
import type { LintRule, RuleContext, RuleFinding } from '../../src/plugins/contract.js';
import type { QuestionnaireFinding } from '../../src/report/types.js';
import { runRules } from '../../src/run/rules.js';

// A RuleContext over sites, with the stub scopeAt the runner gives every rule, that collects what
// the rule reports.
export function ruleContext(
  sites: readonly ExpressionSite[],
  findings: RuleFinding[],
): RuleContext {
  return {
    document: { file: 'Q.json', resource: {}, resourcePointer: '', localResources: [] },
    sites,
    scopeAt: () => ({ available: false, names: [] }),
    compat: {},
    options: undefined,
    report: (finding) => findings.push(finding),
  };
}

// What a rule that reads only its context reports on sites.
export function checkSites(rule: LintRule, sites: readonly ExpressionSite[]): RuleFinding[] {
  const findings: RuleFinding[] = [];
  rule.check(ruleContext(sites, findings));
  return findings;
}

// The findings of one sdc rule on a Questionnaire, as the report shows them: the runner calls it
// with core's analysis of the document, built with hostVariables.
export function lintQuestionnaire(
  ruleName: string,
  resource: Record<string, unknown>,
  hostVariables: readonly string[] = [],
): QuestionnaireFinding[] {
  const document: QuestionnaireDocument = {
    file: 'Q.json',
    resource: { resourceType: 'Questionnaire', id: 'Q', ...resource },
    resourcePointer: '',
    localResources: [],
  };
  const sites = findExpressionSites(document);
  const rule = sdcPlugin.rules[ruleName];
  if (rule === undefined) throw new Error(`no sdc rule ${ruleName}`);
  const doc = {
    input: { path: '/ig/Q.json', display: 'Q.json', baseRelative: 'Q.json' },
    document,
    sites,
    analysis: analyseDocument(document, sites, hostVariables),
  };
  return runRules(doc, [
    {
      id: `sdc/${ruleName}`,
      namespace: 'sdc',
      rule,
      setting: rule.meta.defaultSeverity,
      compat: {},
    },
  ]);
}
