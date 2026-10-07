# Vocabulary

Terms used in this repository's code, messages and docs, for contributors who are new to FHIR forms or to this linter.

[GLOSSARY.md](../GLOSSARY.md) is canonical for the linter's core terms (finding, suppression, stale suppression, rule off, expression site, registered location, carrier) and the words to avoid in their place. This file links to those entries instead of repeating them. Where a term is specified in a doc, the entry links to it. Entries marked _planned_ are specified but not built yet; the README's **Status** paragraph says what works today.

## FHIR basics

**FHIR**
HL7's standard for exchanging health data as typed JSON or XML documents called resources.

**Resource**
One FHIR document with a `resourceType`, such as Questionnaire, QuestionnaireResponse, Bundle or Patient. A resource may have an `id`, but the linter does not rely on it: see resource identity.

**Questionnaire**
The FHIR resource that defines a form: its items, and through SDC extensions, its calculations, visibility, prefill and extraction logic. The linter's unit of work is one Questionnaire.

**QuestionnaireResponse**
The resource holding a user's answers to a Questionnaire. In SDC expressions it is usually `%resource`.

**Item**
One entry of `Questionnaire.item`: a question, a group or display text. Items nest. Code calls the item that encloses an expression its `SiteItem`.

**linkId**
The identifier of an item, unique within its Questionnaire. Messages name an item by its text and linkId, and suppressions select an item by linkId.

**Repeating group**
A group item with `repeats: true`, so the form can hold several instances of it. Expressions on or below it are evaluated per instance, which matters to `smart-forms/repeating-group-variable`.

**Bundle**
A resource holding other resources in `entry[].resource`. The linter checks every Questionnaire in a Bundle and keeps the other entries as local reference targets.

**Contained resource**
A resource embedded in another resource's `contained` array. The walker searches contained resources for unregistered expressions only.

**Extension**
FHIR's mechanism for adding data an element does not define, identified by its `url`. A complex extension holds sub-extensions, as `targetConstraint` does.

**Primitive extension**
An extension on a primitive value, carried by the `_element` companion property: an extension on `item.text` sits in `item._text.extension`. `ExpressionSite.element` records the element name.

**Expression (datatype)**
The FHIR datatype most SDC expressions use, with `language`, `expression` (the text), `name` and `reference`. It is the "Expression object" carrier in [GLOSSARY.md](../GLOSSARY.md).

**Invariant**
A constraint a FHIR profile declares, such as Questionnaire's `que-2`. The FHIR Validator checks invariants; the linter does not repeat them.

**FHIR Validator**
HL7's validator for FHIR structure, cardinality, extension context, invariants and profiles; IG Publisher runs it too. The linter complements it and leaves structural checks to it ([core-plan §1.2](core-plan.md#12-boundaries)).

## SDC

**SDC (Structured Data Capture)**
HL7's implementation guide that adds dynamic behaviour to Questionnaires: variables, calculated answers, conditional display, prefill and extraction, all expressed through extensions.

**Use case**
When an expression is evaluated: `rendering` (while the form is displayed and filled in), `population` (prefilling it from existing data) or `extraction` (turning answers into other resources). Each registry entry lists its use cases; `ExpressionUseCase` in code.

**Population**
Prefilling a form from patient and context data before the user sees it, in SDC terms `$populate`. In Smart Forms this is the populate component.

**Extraction**
Creating or updating FHIR resources from a completed QuestionnaireResponse, in SDC terms `$extract`. Smart Forms implements template-based extraction in its template-extract component.

**Declaration**
An expression that introduces a name other expressions can reference as `%name`. In the registry, the `variable` and `itemPopulationContext` extensions declare; `ExpressionSite.declares` records it.

**Named expression**
Any Expression with a `name`. Only a declaration makes the name referenceable under SDC; a name on another expression, such as a calculatedExpression, is recorded but does not declare.

**Variable**
A declaration made with the `variable` extension (`http://hl7.org/fhir/StructureDefinition/variable`) on the Questionnaire root or an item. It is visible to expressions on the same element and its descendants.

**Shadowing**
A descendant declaration reusing an ancestor's name. SDC allows it, so `sdc/shadowed-declaration` defaults to `info` ([plan-amendments](plan-amendments.md)).

**Launch context**
A named value the launching application supplies, such as the patient or the current user, declared with the `launchContext` extension and referenced as `%patient`, `%user` and so on.

**Environment variable (FHIRPath)**
A `%`-prefixed name supplied by the evaluator rather than declared in the form: `%resource` (the QuestionnaireResponse), `%context`, and SDC's `%questionnaire` (the Questionnaire) and `%qitem` (the current item). [core-plan §4.3](core-plan.md#43-why-questionnaire-and-qitem-need-a-compatibility-rule) explains why `%questionnaire` and `%qitem` need a compatibility rule.

**SDC expression extensions**
The registered extensions in [extension-catalog.ts](../packages/core/src/analysis/extension-catalog.ts), each with its own use cases and allowed languages:

| Extension | What it does |
| :- | :- |
| `calculatedExpression` | Computes an item's answer while the form is filled in |
| `enableWhenExpression` | Decides whether an item is shown |
| `initialExpression` | Supplies an item's initial answer during population |
| `candidateExpression`, `answerExpression` | Supply possible answers |
| `contextExpression` | Supplies context shown alongside an item |
| `itemPopulationContext` | Selects the data a group is populated from, and declares a name for it; on a repeating group it creates one instance per result |
| `itemExtractionContext` | Selects or creates the resource that an item's answers are extracted into |
| `answerOptionsToggleExpression` | Enables or disables answer options; complex extension |
| `targetConstraint` | A validation constraint on answers; complex extension |
| `cqf-expression` | A dynamic value for a primitive element such as `_text`, `_prefix`, `_answerValueSet` or the root `_title` |

Other SDC extensions the plan names, such as `templateExtractContext`, `sourceQueries` and `cqf-calculatedValue`, are not registered yet.

## Expression languages

**Expression language**
The media type in `Expression.language`. FHIR R4 binds it to an extensible value set, so other values are allowed but get `sdc/language-not-in-value-set` _(planned)_.

**FHIRPath** (`text/fhirpath`)
A path-based query language over FHIR data. A missing path yields an empty collection rather than an error, so a typo fails silently at runtime; that is the main reason this linter exists.

**fhirpath.js**
HL7's JavaScript FHIRPath implementation, pinned to 4.10.1. The linter uses it to parse expressions; "valid FHIRPath" can still differ from "valid for this engine".

**x-fhir-query** (`application/x-fhir-query`)
A FHIR REST search URL, such as `Observation?subject={{%patient.id}}`, whose `{{…}}` parts are embedded FHIRPath fragments. The query syntax itself is checked by `sdc/query-syntax` _(planned)_.

**Embedded fragment**
One `{{…}}` FHIRPath fragment inside an x-fhir-query string. It is an expression site of its own, and its positions are rebased onto the containing query string _(planned)_.

**CQL** (`text/cql`)
Clinical Quality Language. Allowed at several registered locations but out of scope: no form in scope uses it.

**Language setting**
The config's `languages` map: `analyse` checks expressions in that language, `recognise` accepts the language without checking its body. Recognising x-fhir-query still analyses its FHIRPath fragments.

## Smart Forms

**Smart Forms**
AEHRC's open-source SDC form stack (`aehrc/smart-forms`). It is released as three independently versioned components, so a construct can work in one and fail in another.

**Component**
One part of the Smart Forms stack, named by its config key: `renderer` (displays the form and evaluates rendering expressions), `populate` (population) and `template-extract` (extraction).

**Compatibility matrix**
Data in the Smart Forms plugin recording, for each expression location and component version, whether the component supports, ignores or restricts it, with the rule and a reproducing test. It is pinned with the plugin.

**Compatibility target** (`compat`)
The component versions a config checks against. `"smart-forms": "latest"` is the default and means the newest versions in the installed plugin's matrix; reports always show the resolved exact versions. A version the matrix does not cover is a config error, never silently replaced by a nearby one.

**Compatibility finding**
A finding about a form that is valid SDC but fails or misbehaves on the selected components, reported by a `smart-forms/*` rule rather than an `sdc/*` rule.

**Flat variable context**
How the Smart Forms components store declarations: in one shared namespace, so names in separate SDC scopes can collide (`smart-forms/flat-variable-context`).

**additionalContext**
The renderer's integration API through which a host application can supply extra values such as `%questionnaire`. A suppression that relies on it must name the host and its test.

## Authoring toolchain

**IG (implementation guide)**
A published FHIR specification package. Forms in scope are written as an IG; the first integration is `aehrc/gpccmp-fhir-ig`.

**FSH (FHIR Shorthand)**
The text language IG authors write Questionnaires in. It is the maintained source: findings point to FSH lines when mapping is reliable, and fixes go there.

**SUSHI**
The compiler from FSH to FHIR JSON, run as `sushi .`. The linter reads its output, so SUSHI must run again after FSH edits.

**Compiled JSON**
SUSHI's output in `fsh-generated/resources`, the linter's default input. Edits there are overwritten by the next SUSHI build.

**SUSHI index** (`fsh-generated/data/fsh-index.json`)
SUSHI's map from each generated resource to the FSH file and line range of its definition. It locates definitions, not individual expressions.

**IG Publisher**
HL7's tool that builds the published IG site and runs the FHIR Validator. The lint workflow does not run it.

## Analysis

**Pipeline**
The stages of a run: loader, registry and walker, language analysis, scope model, rules, source mapper, then the finding processor and reporters ([core-plan §3](core-plan.md#3-analysis-pipeline)).

**Questionnaire document**
One Questionnaire to check, with its input file, resource pointer and local reference targets; `QuestionnaireDocument` in code. Rules receive one at a time.

**Resource identity**
How a finding names its resource: resource type, optional `id`, and the JSON Pointer to the resource within the file. The pointer identifies the resource even when the id is missing or duplicated.

**JSON Pointer**
An RFC 6901 path into a JSON file, such as `/item/1/extension/0/valueExpression/expression`. Every pointer in findings and code starts at the root of the input file, not the resource.

**Local reference target**
A resource in the same Bundle as the Questionnaire, available when resolving references without network access; `localResources` in code.

**Registry**
The table of SDC locations the linter understands: each entry's extension URL, the elements it may sit on, its carrier, whether it declares, its allowed languages and its use cases. Supporting a new location is a new entry, not walker code.

**Rule registry**
`buildRuleRegistry` in [rule-registry.ts](../packages/core/src/plugins/rule-registry.ts): every rule from the built-in and configured plugins, with its effective severity, and the plugins that provide them. Not the Registry above, which is about expression locations.

**Registered location**
See [GLOSSARY.md](../GLOSSARY.md). In code, `RegisteredLocation` holds the extension URL and, for a complex extension, the sub-extension URL.

**Owner**
The element a registry entry may sit on: the Questionnaire `root` or an `item`.

**Walker**
`walkDocument` in [walker.ts](../packages/core/src/analysis/walker.ts): it traverses one Questionnaire depth-first and returns its expression sites in document order.

**Expression site**
See [GLOSSARY.md](../GLOSSARY.md). In code, `ExpressionSite` carries `pointer` (the expression text) and `expressionPointer` (the Expression object); they differ when the Expression has no text.

**Generic detection**
How the walker finds unregistered expressions: any object with a string `language` and `expression` outside a registered location. Such sites get syntax checks and an `sdc/unregistered-expression` info finding.

**Carrier**
See [GLOSSARY.md](../GLOSSARY.md). Expression objects and `{{…}}` fragments in x-fhir-query are discovered (`ExpressionCarrier`); whole-string FHIRPath and indirect references are _planned_.

**Scope model** _(planned)_
The analysis of which names are visible at a site for each use case, and how declarations depend on each other. Rules ask for it through `RuleContext.scopeAt`; until it exists, scope is reported as unavailable.

**External expression**
An Expression that has only a `reference` to content outside the input, so it cannot be analysed locally (`sdc/external-expression`, _planned_). The linter never fetches over the network.

## Rules and plugins

**Rule**
One check, run once per Questionnaire document over its expression sites. Rules are synchronous, read-only and offline, and report findings through `report()`; an exception fails the run as `RULE_CRASH`.

**Rule ID**
`<namespace>/<rule-name>`, such as `sdc/parse-error`, used identically in config, suppressions, docs and reports. A retired ID is never reused.

**Namespace**
The prefix of a rule ID, taken from the plugin's `meta.name`. `sdc` is core, `smart-forms` is the Smart Forms plugin, and `lint` is reserved for findings about the linter's own configuration.

**Plugin**
A `LintPlugin`: a name, a version and a set of rules. External plugins are imported in an `.mjs` config and listed in `plugins`; installing one does not enable it.

**Built-in plugin / `sdc` preset**
Core's own rules, packaged as the `sdc` plugin and enabled without any import.

**Rule context**
What a rule receives: the document, its sites, `scopeAt`, its options and `report`; `RuleContext` in code.

**Runner**
The part of a run that calls each enabled rule, attaches its rule ID, resolves severity and applies suppressions.

**Severity**
`error`, `warning` or `info`. Only unsuppressed errors make `lint` exit 1. `off` is not a severity: it is a rule setting (see rule off in [GLOSSARY.md](../GLOSSARY.md)).

**Default severity / effective severity**
A rule's severity as shipped, and its severity after config overrides. `explain` lists both.

**Rule docs**
The offline documentation `sdc-lint explain <rule-id>` prints, in a fixed template: what it checks, why it matters, an example message, how to fix it, and known limitations.

**Rule maturity** _(planned)_
`preview` or `stable`. A rule is promoted after its false-positive rate is measured on real forms.

## Configuration and suppressions

**Config**
`sdc-questionnaire-lint.config.json` or `.mjs`, discovered in the current directory only, or given with `--config`. Only an `.mjs` config can load plugins. `defineConfig` types it.

**Path base**
What a relative path resolves against: the working directory for CLI paths and `--config`, the config's directory for paths inside the config ([cli.md](cli.md#configuration-and-path-bases)).

**Suppression**, **stale suppression**, **rule off**
See [GLOSSARY.md](../GLOSSARY.md). A suppression is an entry in the config's `suppress` array; a stale one is reported as `lint/stale-suppression`.

**Selector**
The fields of a suppression entry that pick its expression site: `file`, and optionally `linkId`, `extensionUrl`, `declaration`, `resource` and `pointer`. Stable identity (file, linkId, extension URL) is preferred to array-based pointers. A selector matching several sites is a config error.

**Suppression assessment**
Whether a run could decide that a suppression is still needed. Each entry ends up `applied` (it matched a finding), `stale` (shown to be unnecessary) or `not assessed` ([cli.md](cli.md#stale-suppressions)).

**Baseline**
A file of accepted existing findings. This project has none, and no inline disable comments in FSH.

## Runs and reports

**Targeted run**
A `lint` run given explicit paths. It assesses only suppressions for the selected files.

**Full run**
A `lint` run over the config's `files`, or `fsh-generated/resources` when there is none. It can also report suppressions whose files were deleted.

**Input selection**
Choosing the inputs by precedence, CLI paths, then config `files`, then the default directory, with no fallback between levels. A missing path or unmatched glob fails the run.

**Skipped file**
A valid JSON input that is neither a Questionnaire nor a Bundle. It is counted, not reported.

**Report**
The record of one run: `completed` (findings, run metadata and summary; exit 0 or 1) or `failed` (a failure record; exit 2). JSON output is the full record; text renders it ([report-format.md](report-format.md)).

**Failure**
A run that did not complete, identified by a stable failure code such as `CONFIG_INVALID`, `NO_QUESTIONNAIRES` or `RULE_CRASH`. Partial findings are discarded.

**Finding kind**
`questionnaire` for a finding at an expression site, with a JSON location and a source location; `config` for a finding at a config entry, with a config location such as `/suppress/0`.

**Message, help, note**
The parts of a finding's text: `message` states the problem in author terms, `help` states the fix as an assertion (not "Did you mean…?"), `note` adds context.

**Related locations**
Other sites relevant to a finding, such as both sides of a name collision.

**Suggestion**
A described fix with one or more edits, each with an explicit target, the expected old text and its replacement. The CLI never applies them.

**Applicability**
How safe a suggestion is: `machine-applicable` (may be applied unattended), `maybe-incorrect` or `has-placeholders`.

**Source mapping** _(planned)_
Locating a finding's expression in FSH. The result is `mapped`, with confidence `exact` (one literal match) or `anchored` (resolved by linkId or declaration name), or `unmapped` with a reason: `ambiguous`, `multiline`, `not-found` or `source-unavailable`. The linter never invents coordinates.

**Fingerprint**
A stable identifier for a finding, built from the rule, resource identity and site identity rather than line numbers, so it survives edits that move lines.

**Coverage**
The summary's counts of what was checked: files read and skipped, Questionnaires, and expressions `analysed` or `unchecked`. An unchecked expression is one where an applicable check could not run.

**Exit code**
`0`: completed with no unsuppressed errors. `1`: completed with at least one. `2`: the run did not complete.

**Report-only stage / blocking stage**
The two rollout stages in an IG's CI: first the lint job publishes findings without blocking merges; later errors become a required check.

**Effective false positive**
A finding its reader does not act on, even if technically correct. The design guidelines budget about 10% for non-blocking rules and none for blocking ones.
