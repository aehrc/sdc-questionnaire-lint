// The plugin contract (core-plan §5.2). Exported from the package, so changes are public API changes.
import type { AvailableVariables } from '../analysis/available-variables.js';
import type { Declaration } from '../analysis/declarations.js';
import type { Dependencies } from '../analysis/dependencies.js';
import type { ExpressionSite, QuestionnaireDocument } from '../analysis/expression-site.js';
import type { VariableReference } from '../analysis/fhirpath.js';
import type { DeclarationUse } from '../analysis/uses.js';
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
  // Every expression site in the Questionnaire, in document order; each fragment of a query
  // directly follows the query. The array and its sites are frozen.
  readonly sites: readonly ExpressionSite[];
  // Every declaration in the Questionnaire, in document order: the array core's own rules use,
  // frozen, as is each declaration. Each Variable.declaration variablesAt gives is one of its
  // elements, and each declaration's site one of sites. The item of a launchContext or
  // extractAllocateId declaration is a different object from site.item for the same item, so
  // compare items by pointer.
  readonly declarations: readonly Declaration[];
  // The %name references in a site's FHIRPath text, in source order, fragments included; [] when
  // the text parses and references nothing. undefined when the site has no FHIRPath analysis: its
  // language is not text/fhirpath, it has no text, or the text does not parse. A rule treats
  // undefined as "cannot check", never as "no references". The array and its references are
  // frozen.
  referencesAt(site: ExpressionSite): readonly VariableReference[] | undefined;
  // The names an expression can reference at a site, and the variable each name resolves to;
  // undefined at an uncatalogued site, where name analysis cannot run.
  variablesAt(site: ExpressionSite): AvailableVariables | undefined;
  // Whether a site's FHIRPath expression can give a different value for two inputs that share their
  // linkId, such as two repetitions of a group: some term is evaluated with the expression's input
  // as its focus, other than to read the input's linkId, or it uses %context. A syntactic test, not
  // proof that a value differs. undefined where referencesAt is.
  readsInput(site: ExpressionSite): boolean | undefined;
  // referencesAt, variablesAt and readsInput return undefined for an object that is not one of
  // sites: they compare by identity, so a copy of a site is not one.
  // What a declaration's expression references, the declarations its references resolve to
  // included; and whether the expressions of others reference it: referenced, unreferenced, or,
  // when an expression that could reference it was not analysed, blocked (only syntax errors) or
  // unknown. Both follow SDC's scoping, as variablesAt does, and return undefined for an object
  // that is not one of declarations: they compare by identity.
  dependenciesOf(declaration: Declaration): Dependencies | undefined;
  useOf(declaration: Declaration): DeclarationUse | undefined;
  // The component versions the run checks against for this rule's namespace, such as
  // { renderer: '1.4.0', populate: '4.7.1' }; {} when the plugin declares no compat. For a plugin
  // with compat, core guarantees a version for every component in compat.required, and for every
  // other verified component unless an explicit config compat object omits it.
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

// What a plugin's hostVariables receives for one Questionnaire. An object, so that fields can be
// added without breaking the hook.
export interface HostVariablesInput {
  readonly document: QuestionnaireDocument;
  // The same frozen object the plugin's rules get as ctx.compat; {} without compat.
  readonly compat: Readonly<Record<string, string>>;
}

// A plugin: listed in plugins in an .mjs config, it registers its rules under its namespace.
export interface LintPlugin {
  // name is the rule namespace: smart-forms plus variable-name-collision gives
  // smart-forms/variable-name-collision.
  meta: { name: string; version: string };
  rules: Readonly<Record<string, LintRule>>;
  // Declared by a plugin that checks forms against runtime versions selected in config compat.
  compat?: PluginCompat;
  // The names, without %, that the runtime the plugin describes supplies to a Questionnaire's
  // expressions, such as the results of its sourceQueries. Core adds them to the host variables
  // after config hostVariables, so a declaration or an assembleContext name of the same name still
  // wins. It only adds names. Called as a method, once per Questionnaire in a file or a Bundle entry,
  // in plugins order, before the Questionnaire is analysed, whenever the plugin is listed, even with
  // all its rules off. Runs synchronously and is pure: it must not mutate input or access the
  // network. Duplicates and a name with a space are allowed; a name FHIRPath, FHIR or SDC defines is
  // dropped. A throw, a returned promise, or a result that is not an array of non-empty strings
  // without % fails the run with PLUGIN_CRASH.
  hostVariables?(input: HostVariablesInput): readonly string[];
}
