// The plugin contract (core-plan §5.2). Exported from the package, so changes are public API changes.
import type { OffsetRange, Severity } from '../report/types.js';

export type { Severity };

// A use case that evaluates an expression: rendering the form, populating it, or extracting
// resources from its response.
export type ExpressionUseCase = 'rendering' | 'population' | 'extraction';

// The supporting types below carry what the analysis engine provides so far; they gain fields as
// it is built (core-plan §3.1).

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

// A resource in the same Bundle, which a local reference can target.
export interface LocalResource {
  readonly pointer: string;
  readonly resource: Readonly<Record<string, unknown>>;
}

// How a site carries its expression: an Expression object, or a {{…}} fragment embedded in the
// x-fhir-query of one. Whole-string FHIRPath and indirect references come later (core-plan §3.1).
export type ExpressionCarrier = 'expression' | 'fragment';

// Where a fragment sits in its query.
export interface QueryFragment {
  // The decoded x-fhir-query string the fragment is embedded in.
  readonly query: string;
  // Zero-based UTF-16 offsets of the fragment's text within query, excluding the braces.
  readonly startOffset: number;
  readonly endOffset: number;
}

// Identifies a catalogued location: the extension that holds the expression, plus the
// sub-extension for a complex extension such as targetConstraint.
export interface CataloguedLocation {
  readonly url: string;
  readonly subExtension?: string;
}

// The item enclosing a site.
export interface SiteItem {
  // JSON Pointer from the root of the input file.
  readonly pointer: string;
  // Absent when the item has no string linkId.
  readonly linkId?: string;
}

// One expression the linter found in a Questionnaire. Sites are read-only and listed in document
// order; report a finding with site to point at the expression text.
export interface ExpressionSite {
  // JSON Pointer from the root of the input file to the expression text, or to the Expression
  // object when it has no text (a reference-only Expression).
  readonly pointer: string;
  // JSON Pointer from the root of the input file to the Expression object.
  readonly expressionPointer: string;
  readonly carrier: ExpressionCarrier;
  // The catalogued location the site matched; absent for an uncatalogued site.
  readonly location?: CataloguedLocation;
  // Whether the site matched a catalogued location. An uncatalogued site was found by generic
  // detection of an object with a language and an expression; only its syntax and function names
  // can be checked.
  readonly catalogued: boolean;
  // For an expression in a primitive element's extension, such as _text, the element name: text.
  readonly element?: string;
  // The enclosing item; absent for a site on the Questionnaire root or in a contained resource.
  readonly item?: SiteItem;
  // Expression.language, expression, reference and name as written, when they are strings.
  readonly language?: string;
  readonly text?: string;
  readonly reference?: string;
  readonly name?: string;
  // Whether the location declares a name that other expressions can reference, as variable and
  // itemPopulationContext do. A name on another expression is recorded but does not declare.
  readonly declares: boolean;
  // The use cases that evaluate the site; empty for an uncatalogued site.
  readonly useCases: readonly ExpressionUseCase[];
  // Set only when carrier is fragment: where the site's text sits in its query.
  readonly fragment?: QueryFragment;
}

// The names in scope at a site for a use case. A stub until the scope model exists: available
// is false and names is empty (core-plan §3.1).
export interface Scope {
  readonly available: boolean;
  readonly names: readonly string[];
}

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
