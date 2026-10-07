// The plugin contract (core-plan §5.2). Exported from the package, so changes are public API changes.
import type {
  ExpressionSite,
  ExpressionUseCase,
  QuestionnaireDocument,
  Scope,
} from '../analysis/expression-site.js';
import type { OffsetRange, Severity } from '../report/types.js';

export type { Severity };

// What a rule reports. The runner checks it, and fails the run with RULE_CRASH for an invalid one:
// message, and help and note when given, must be non-empty; site must be one of ctx.sites; a
// pointer without a site must lie inside the document's resource; a range needs a site with text
// and must lie within it.
export interface RuleFinding {
  // The problem only; the fix goes in help (plan-amendments: §7.4 fix hints).
  message: string;
  help?: string;
  note?: string;
  // The affected site, or a JSON Pointer from the root of the input file.
  site?: ExpressionSite;
  pointer?: string;
  // Range within the site's text; for a fragment site, within the fragment's text.
  range?: OffsetRange;
  // Overrides the rule's effective severity for this finding.
  severity?: Severity;
}

// What check receives for one Questionnaire.
export interface RuleContext {
  readonly document: QuestionnaireDocument;
  readonly sites: readonly ExpressionSite[];
  scopeAt(site: ExpressionSite, useCase: ExpressionUseCase): Scope;
  // Always undefined: the config cannot pass rule options yet.
  readonly options: unknown;
  report(finding: RuleFinding): void;
}

// Bundled documentation printed by sdc-lint explain <rule-id>, so it works offline. Each field is
// plain text; the template follows linter-design-guidelines.md § 5.
export interface RuleDocs {
  checks: string;
  why: string;
  exampleMessage: string;
  fix: string;
  limitations: string;
}

// One rule. Its ID is <plugin meta.name>/<key in the plugin's rules>.
export interface LintRule {
  meta: {
    description: string;
    defaultSeverity: Severity;
    // An absolute URL, shown by sdc-lint explain <rule-id>.
    docsUrl?: string;
    docs?: RuleDocs;
  };
  // Runs synchronously, once per Questionnaire; must not mutate input or access the network.
  // A throw or a returned promise fails the run with RULE_CRASH.
  check(ctx: RuleContext): void;
}

// A plugin: listed in plugins in an .mjs config, it registers its rules under its namespace.
export interface LintPlugin {
  // name is the rule namespace: smart-forms plus flat-variable-context gives
  // smart-forms/flat-variable-context.
  meta: { name: string; version: string };
  rules: Readonly<Record<string, LintRule>>;
}
