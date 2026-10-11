// The plugin contract (core-plan §5.2). Exported from the package, so changes are public API changes.
import type { AvailableVariables } from '../analysis/available-variables.js';
import type { ExpressionSite, QuestionnaireDocument } from '../analysis/expression-site.js';
import type { VariableReference } from '../analysis/fhirpath.js';
import type { OffsetRange, Severity } from '../report/types.js';

export type { Severity };

// Another place relevant to a finding, such as the other declaration of a duplicated name: a site,
// or a JSON Pointer from the root of the input file. message, when given, says how it relates.
export interface RuleRelatedLocation {
  site?: ExpressionSite;
  pointer?: string;
  message?: string;
}

// What a rule reports. The runner checks it, and fails the run with RULE_CRASH for an invalid one:
// message, and help and note when given, must be non-empty; site must be one of ctx.sites; a
// pointer without a site must lie inside the document's resource; a range needs a site with text
// and must lie within it. Each related location follows the same rules for its site, pointer and
// message, and needs a site or a pointer.
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
  relatedLocations?: RuleRelatedLocation[];
}

// What check receives for one Questionnaire.
export interface RuleContext {
  readonly document: QuestionnaireDocument;
  readonly sites: readonly ExpressionSite[];
  // The %name references in a site's FHIRPath text, in source order, fragments included; [] when
  // the text parses and references nothing. undefined when the site has no FHIRPath analysis: its
  // language is not text/fhirpath, it has no text, or the text does not parse. A rule treats
  // undefined as "cannot check", never as "no references". The array and its references are
  // frozen.
  referencesAt(site: ExpressionSite): readonly VariableReference[] | undefined;
  // The names an expression can reference at a site, and the variable each name resolves to;
  // undefined at an uncatalogued site, where name analysis cannot run.
  variablesAt(site: ExpressionSite): AvailableVariables | undefined;
  // Both return undefined for an object that is not one of sites: they compare by identity, so a
  // copy of a site is not one.
  // The component versions the run checks against for this rule's namespace, such as
  // { renderer: '1.4.0', populate: '4.7.1' }; {} when the plugin declares no compat.
  readonly compat: Readonly<Record<string, string>>;
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

// The runtime versions a plugin's rules can check against (core-plan §2.3). Each component's
// versions are verified independently, so any combination of listed versions can be selected.
export interface PluginCompat {
  // The verified versions of each component, oldest to newest: "latest" selects the last one.
  // Core treats versions as opaque strings and never compares them.
  verified: Readonly<Record<string, readonly string[]>>;
  // The components a config's explicit compat object must name; the others may be omitted.
  required: readonly string[];
}

// A plugin: listed in plugins in an .mjs config, it registers its rules under its namespace.
export interface LintPlugin {
  // name is the rule namespace: smart-forms plus flat-variable-context gives
  // smart-forms/flat-variable-context.
  meta: { name: string; version: string };
  rules: Readonly<Record<string, LintRule>>;
  // Declared by a plugin that checks forms against runtime versions selected in config compat.
  compat?: PluginCompat;
}
