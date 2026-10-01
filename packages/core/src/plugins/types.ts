// The plugin contract (core-plan §5.2). Exported from the package, so changes are public API changes.
import type { OffsetRange, Severity } from '../report/types.js';

export type { Severity };

export type ExpressionUseCase = 'rendering' | 'population' | 'extraction';

// The supporting types below are provisional until the walker exists (core-plan §3.1); they carry
// only what the CLI needs today and gain fields as the analysis engine is built.

// One Questionnaire to check, standalone or inside a Bundle.
export interface QuestionnaireDocument {
  // Display path of the input file.
  readonly file: string;
  readonly resource: Readonly<Record<string, unknown>>;
  // JSON Pointer to the resource within the file: "" for a standalone root.
  readonly resourcePointer: string;
  // Every resource in the same Bundle, as local reference targets; empty for a standalone file.
  readonly localResources: readonly LocalResource[];
}

export interface LocalResource {
  readonly pointer: string;
  readonly resource: Readonly<Record<string, unknown>>;
}

export interface ExpressionSite {
  // JSON Pointer from the root of the input file.
  readonly pointer: string;
}

export interface Scope {
  readonly available: boolean;
  readonly names: readonly string[];
}

export interface RuleFinding {
  // The problem only; the fix goes in help (plan-amendments: §7.4 fix hints).
  message: string;
  help?: string;
  note?: string;
  // The affected site, or a JSON Pointer from the root of the input file.
  site?: ExpressionSite;
  pointer?: string;
  // Diagnostic range within the expression text.
  range?: OffsetRange;
  // Overrides the rule's effective severity for this finding.
  severity?: Severity;
}

export interface RuleContext {
  readonly document: QuestionnaireDocument;
  readonly sites: readonly ExpressionSite[];
  scopeAt(site: ExpressionSite, useCase: ExpressionUseCase): Scope;
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

export interface LintRule {
  meta: {
    description: string;
    defaultSeverity: Severity;
    docsUrl?: string;
    docs?: RuleDocs;
  };
  // Runs synchronously, once per Questionnaire; must not mutate input or access the network.
  check(ctx: RuleContext): void;
}

export interface LintPlugin {
  // name is the rule namespace: smart-forms plus flat-variable-context gives
  // smart-forms/flat-variable-context.
  meta: { name: string; version: string };
  rules: Readonly<Record<string, LintRule>>;
}
