# SDC Questionnaire linter Plan

# 1. Purpose and scope

Build sdc-questionnaire-lint: a command-line tool and library for checking expressions inside FHIR SDC Questionnaires before they reach a renderer.

A questionnaire contains executable logic: expressions control visibility, calculations, population and extraction. A misspelled variable can be valid JSON and valid FHIR structure while still failing when the form runs. The linter checks that expression text and reports compatibility problems with a specified Smart Forms stack.

The first integration is in aehrc/gpccmp-fhir-ig. CI runs SUSHI to generate Questionnaire JSON, then runs the linter. Findings identify the FSH file and line where possible and retain the JSON location in every case.

## 1.1 Included checks

- FHIRPath syntax and unknown function names.
- Undefined variables, declaration collisions, shadowing and unused declarations.
- Variable visibility in rendering, population and extraction.
- Self-references and cycles between named expressions.
- References to missing questionnaire items, where the target can be established statically.
- Expression languages allowed at each registered location.
- Constructs ignored or incorrectly evaluated by the selected Smart Forms components.

The tool analyses expressions without evaluating them against patient data. Passing the linter does not prove that a calculation produces the intended result; behavioural and integration tests remain necessary.

## 1.2 Boundaries

| Concern | Responsible tool |
| :- | :- |
| FHIR structure, extension context, cardinality and permitted value[x] types | FHIR Validator, including its use within IG Publisher |
| Duplicate linkId values and core enableWhen.question references | FHIR Validator |
| Existing SDC invariants, including the query-language restriction on enableWhenExpression | FHIR Validator with the SDC package |
| FHIRPath syntax, names, scope and dependencies inside expressions | This linter |
| Compatibility with a selected renderer, population or extraction implementation | This linter's Smart Forms plugin |

The linter complements the [FHIR Validator](https://github.com/hapifhir/org.hl7.fhir.core). It does not repeat existing structural checks such as Questionnaire's que-2 invariant.

## 1.3 Out of scope

1. CQL analysis: no form in scope uses it.
2. Autofix: no rule has a safe mechanical fix.
3. An editor extension or language server.
4. An IG Publisher plugin.
5. Re-implementing checks the FHIR Validator already performs.
6. Fetching external references over the network during a lint run.

# 2. Packages and repositories

## 2.1 Packages

| Package | Responsibility |
| :- | :- |
| sdc-questionnaire-lint | CLI and library; registry, walker, FHIRPath analysis, scope model, core sdc rules, source mapping and reporters |
| @sdc-questionnaire-lint/plugin-smart-forms | Eight smart-forms compatibility rules, version-specific compatibility data and reproduction tests |

Core works independently of Smart Forms. The plugin does not install the renderer, population or extraction packages as production dependencies; those packages are development dependencies used to reproduce compatibility failures.

Both packages use TypeScript, Node 22 or later, tsup and Vitest. The FHIRPath parser is pinned to fhirpath.js 4.10.1. The CLI is a thin adapter over the library so another tool can consume the same findings without invoking a shell command.

## 2.2 Repository responsibilities

| Repository | Proposed responsibility |
| :- | :- |
| aehrc/smart-forms | Source of component implementations and versions used by compatibility reproduction tests |
| Separate linter repository; proposed name aehrc/sdc-questionnaire-lint | Both npm packages, their tests, documentation and release workflow |
| aehrc/gpccmp-fhir-ig | Form source, dependency pins, linter configuration, local author scripts and CI integration |
| aehrc/smart-forms-ig, if agreed | Shared home for the optional Smart Forms Questionnaire profile |

## 2.3 Compatibility matrix

The compatibility matrix is data maintained by the plugin. For each expression location and component version, it records whether the component supports it, ignores it, or evaluates it with restrictions. Entries link to the applicable rule and a test demonstrating the behavior.

For example: **[[C1]](#c1)** *(comment anchored on both examples below)*

```json
{
  "compat": {
    "smart-forms": {
      "renderer": "1.4.0",
      "populate": "4.7.1",
      "template-extract": "1.0.15"
    }
  }
}
```

```json
{
  "compat": {
    "Smart-forms": "latest"}
}
```

This tells the linter which runtime behavior to check against. It does not install those versions or make a form run on them. The configuration must describe the components used by the consuming application.

Three versions are needed because the components are released independently. A feature may work during population and fail during rendering. The matrix must therefore distinguish the responsible component and expression location, rather than assign one support flag to the whole form.

If the plugin has no verified matrix covering the requested versions, it reports a configuration error. It must not silently substitute a nearby version. Core analysis can still be used with the compatibility plugin disabled.

# 3. Analysis pipeline

*[image in the Google Doc — not copied]*

The pipeline has the following responsibilities:

| Component | Input | Output |
| :- | :- | :- |
| Loader | Files or globs | Questionnaire documents with input-file and resource identity |
| Registry and walker | Documents and registered expression locations | Expression sites and declarations |
| Language dispatcher and analyser | Sites with expression text | Parsed expressions, variable references, function calls and syntax findings |
| Scope model | Sites, declarations and evaluation use cases | Visible names and declaration dependencies |
| Rules | Document and analysis data | Findings at JSON locations |
| Source mapper | Sites, FSH directories and SUSHI index | FSH locations or explicit unmapped results |
| Finding processor and reporters | Findings, configuration and optional source locations | Text, GitHub annotations and summary, JSON and SARIF |

## 3.1 Inputs and expression discovery

Inputs are compiled Questionnaire JSON or Bundles containing Questionnaires. Bundle resources that supply local reference targets remain available to analysis. Malformed JSON, unreadable inputs or an input selection containing no Questionnaires produce an input error.

The walker recursively inspects questionnaire items, primitive extensions and contained resources. It retains resource boundaries so that declarations in one Questionnaire cannot accidentally become visible in another.

The registry defines how to interpret each supported location:

| Carrier | Example of handling |
| :- | :- |
| Expression object | Read its language, inline expression, name and optional reference |
| Whole-string FHIRPath | Treat a registered string value as FHIRPath even though it has no language field |
| Embedded FHIRPath | Extract registered {{...}} fragments from a query; preserve the containing string and fragment offsets |
| Indirect reference | Resolve content present in the input, otherwise report that the expression could not be analysed |
| Declaration | Register a name with its owning element and applicable use cases |

Each entry also defines allowed languages, built-in variables and scope behavior. Bundle references such as sourceQueries and templateExtractBundle require their own adapters; they are not ordinary Expression objects.

Generic detection also finds objects with language and expression outside registered locations. Such sites receive syntax and function checks where supported, plus an informational finding that scope was not analysed.

# 4. Rule catalogue

Rule IDs use `<namespace>/<rule-name>` for both core and plugins. Configurations, suppressions, documentation and machine-readable reports use these same IDs.

## 4.1 Core rules: sdc **[[C2]](#c2)**

| ID | Check | Default |
| :- | :- | :- |
| sdc/parse-error | Inline or registered whole-string FHIRPath does not parse | error |
| sdc/query-syntax | It flags any x-fhir-query expression that isn't a valid FHIR query and suggests switching the language to text/fhirpath when the expression looks like FHIRPath. | error or warning |
| sdc/undefined-variable | A variable is unavailable in the analysed scope for the site and use case | error |
| sdc/unknown-function | A function is absent from the pinned FHIRPath and SDC function catalogue | error |
| sdc/duplicate-declaration | A name is declared twice on one element, including collisions across declaration kinds | error |
| sdc/shadowed-declaration | A descendant declaration shadows an ancestor | warning |
| sdc/unused-declaration | A declaration has no reference in the applicable use cases whose consumers are present | warning |
| sdc/language-not-allowed | The language is not allowed at this site; excludes restrictions already enforced by an existing Validator invariant | error |
| sdc/language-not-in-value-set | The language is outside the FHIR R4 expression-language value set; account for its extensible binding | warning |
| sdc/unresolved-linkid | A literal linkId reference demonstrably targeting this Questionnaire or its response resolves to no item | error |
| sdc/fragment-parse-error | A registered {{...}} fragment does not parse | error |
| sdc/external-expression | Required expression content is unavailable locally through its reference | info |
| sdc/unregistered-expression | An expression is outside the registry; scope is not analysed | info |
| sdc/dependency-cycle | Named-expression dependencies contain a self-reference or cycle | error |

For sdc/unresolved-linkid, an uncertain target is reported as unchecked at info. For example, a reference through %previousResponse must not be validated against this form's linkIds unless the relationship is established.

## 4.2 Smart Forms compatibility rules

| ID | Check against the selected component versions | Default |
| :- | :- | :- |
| smart-forms/unsupported-expression-language | A component ignores a spec-valid expression because of its language | error |
| smart-forms/flat-variable-context | Declarations that the component stores in one shared context collide, including names in otherwise separate specification scopes | error |
| smart-forms/questionnaire-variable-unavailable | %questionnaire or %qitem is used where the default component pipeline does not supply it | error |
| smart-forms/x-fhir-query-embedding-shape | An embedding is not the supported %launchContext.path shape, or its remainder depends on another variable | error |
| smart-forms/template-extract-context-string-only | templateExtractContext uses an Expression where the extractor reads only valueString | error |
| smart-forms/repeating-group-variable | A variable on or below a repeating group is evaluated per instance but stored under one shared name | warning |
| smart-forms/named-expression-not-referenceable | An expression references a name declared by another expression that the responsible component does not expose as a variable | error |
| smart-forms/unchecked-language-evaluated-as-fhirpath | A non-FHIRPath expression is accepted without a language check and evaluated as FHIRPath, such as at targetConstraint or nested answerOptionsToggleExpression | error |

Checks apply to the component and use case recorded in the matrix. In particular, do not confuse a named calculatedExpression that the renderer does not expose with a launch or population context that another component does supply. The named-expression rule is triggered by a reference to an unavailable name, not merely by the declaration's presence.

The repeating-variable rule applies to variable. It must not reject itemPopulationContext solely because it occurs on a repeating group; that is a valid population pattern used by GP CCMP.

## 4.3 Why %questionnaire and %qitem need a compatibility rule

SDC defines %questionnaire as the Questionnaire and %qitem as the corresponding Questionnaire item. These differ from %resource, which represents the QuestionnaireResponse in this context. Their specification meanings are described in the [SDC FHIRPath supplements](https://hl7.org/fhir/uv/sdc/STU4/en/expressions.html#fhirpath).

The pinned Smart Forms pipelines do not supply both questionnaire variables automatically. An expression can therefore pass core scope checks and still fail at runtime. That is a compatibility finding rather than an undefined-variable finding under the specification.

A host application may supply extra context through an integration API such as the renderer's additionalContext. A documented exception must identify which host supplies the value and verify that its value and evaluation context are correct; merely declaring the name in documentation does not make it available.

Existing source evidence also distinguishes cqf-expression, read by the renderer at \_text, \_prefix and \_answerValueSet for FHIRPath, from cqf-calculatedValue, for which earlier investigations found no consumer in the pinned stack. Keep unsupported sites visible in the matrix.

# 5. Plugin contract

### 5.1 Execution model

A plugin provides rules over the linter's analysis data. The linter prepares one Questionnaire document and a flat list of expression sites, then calls each enabled rule once for that document. Rules can inspect one site or compare several sites.

The flat list retains each site's enclosing item and resource identity. Plugins do not subscribe to walker callbacks and do not extend the registry through this interface.

Rules run synchronously, treat input data as read-only and report findings through report(). They do not mutate the questionnaire, evaluate it against patient data, access the network or format output. Unexpected rule exceptions fail the run and identify the failing rule.

## 5.2 Proposed interface

```ts
export type Severity = 'error' | 'warning' | 'info';
export type ExpressionUseCase = 'rendering' | 'population' | 'extraction';
export interface LintPlugin {
  meta: { name: string; version: string };
  rules: Readonly<Record<string, LintRule>>;
}
export interface LintRule {
  meta: {
    description: string;
    defaultSeverity: Severity;
    docsUrl?: string;
  };
  check(ctx: RuleContext): void;
}
export interface RuleContext {
  readonly document: QuestionnaireDocument;
  readonly sites: readonly ExpressionSite[];
  scopeAt(site: ExpressionSite, useCase: ExpressionUseCase): Scope;
  readonly options: unknown;
  report(finding: RuleFinding): void;
}
```

| Supporting type | Required information |
| :- | :- |
| QuestionnaireDocument | Questionnaire, input file, resource identity and local reference targets |
| ExpressionSite | JSON Pointer, enclosing item, carrier kind, extension or element identity, language, text or reference, declaration name, applicable use cases and embedded-fragment offsets |
| Scope | Whether analysis is available, visible names and their origins |
| RuleFinding | Message, affected site or JSON Pointer, optional diagnostic range and optional finding-specific severity |

The runner attaches the active rule ID, resolves default and configured severities, and applies suppressions. The mapper adds source locations afterwards. Supporting types used in exported signatures are public contracts and require documentation.

Rule keys inside a plugin omit the namespace. The loader combines meta.name with the key: smart-forms plus flat-variable-context becomes smart-forms/flat-variable-context. Core is the built-in sdc plugin and follows the same convention. Duplicate namespaces or rule IDs are configuration errors.

## 5.3 Loading and dependencies

The built-in sdc preset requires no import. External plugins are imported by an .mjs configuration and passed as objects to the linter. JSON configurations cannot load code.

The configuration contract in section 6 uses a plugins array. Listing a plugin enables its rules at their defaults, subject to rules overrides. Importing or installing a package without listing it does not enable it. Rule options are validated by the rule receiving them.

The Smart Forms plugin must work through this public interface. It declares the core versions it supports in peerDependencies; the runtime versions it checks belong in the compatibility matrix. These are separate version relationships.

Automatic plugin discovery, plugin names resolved from JSON, plugin-defined presets, generic option schemas, automatic fixes and a third-party rule-testing framework are outside the initial contract. Ordinary rule tests remain required.

# 6. Configuration and exceptions

The CLI discovers sdc-questionnaire-lint.config.json or sdc-questionnaire-lint.config.mjs, or uses the file supplied through --config. If both default files exist, require an explicit selection rather than guessing.

## 6.1 Core-only configuration

```json
{
  "presets": ["sdc"],
  "languages": {
    "text/fhirpath": "analyse",
    "application/x-fhir-query": "recognise"
  },
  "source": {
    "fsh": ["input/fsh"]
  },
  "rules": {
    "sdc/unused-declaration": "warning"
  }
}
```

Recognising a query body does not disable analysis of its registered FHIRPath fragments. The FHIRPath language setting controls those fragments.

## 6.2 Configuration with Smart Forms checks

The proposed JavaScript form imports the plugin explicitly:

```js
import { defineConfig } from 'sdc-questionnaire-lint';
import smartForms from '@sdc-questionnaire-lint/plugin-smart-forms';
export default defineConfig({
  presets: ['sdc'],
  plugins: [smartForms],
  compat: {
    'smart-forms': {
      renderer: '1.4.0',
      populate: '4.7.1',
      'template-extract': '1.0.15'
    }
  },
  languages: {
    'text/fhirpath': 'analyse',
    'application/x-fhir-query': 'recognise'
  },
  source: { fsh: ['input/fsh'] },
  rules: {
    'smart-forms/repeating-group-variable': 'warning'
  }
});
```

error, warning and info are finding severities. off is a configuration value that prevents a rule from running. Unknown rule IDs and invalid options are configuration errors.

## 6.3 Suppressing a finding

An exception disables a selected rule at an expression site; it does not disable the FSH line or other checks on that expression. Each exception requires a written reason.

Prefer the input file, enclosing linkId and extension URL over an array-based JSON Pointer. Adding a different item can shift pointers while leaving the question's identity unchanged.

Example entry in the configuration's suppress array:

```json
{
  "rule": "smart-forms/questionnaire-variable-unavailable",
  "file": "fsh-generated/resources/Questionnaire-Example.json",
  "linkId": "patient-summary",
  "extensionUrl": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression",
  "reason": "The host supplies %questionnaire through additionalContext; covered by the host integration test."
}
```

A selector must identify the intended expression site. A declaration name can disambiguate repeated extensions; a JSON pointer is accepted for root-level sites, contained-resource sites or cases without a stable item selector. Bundle inputs also require the resource identity when the selector would otherwise be ambiguous.

A missing reason or a selector matching several expression sites is a configuration error. A suppression matching nothing produces a warning. Multiple occurrences of the same rule within the selected expression are covered by that exception.

There is no baseline file and no FSH lint-disable comment syntax. Existing findings must be fixed or explicitly suppressed. A rule can also be disabled globally with "rule-id": "off", which is a broader exception.

# 7. Source mapping and diagnostics

## 7.1 Mapping a finding to FSH

The mapper receives the expression site, configured FSH directories and SUSHI's definition index. It follows this procedure:

1. Use fsh-generated/data/fsh-index.json to identify the source file and definition range. Without a usable entry, search the configured directories and establish the matching resource's identity.
2. Search for the expression encoded as an FSH string literal. For a query fragment, first find its containing query.
3. Accept a unique match within the identified definition.
4. For repeated text, use the corresponding linkId or declaration name to select one candidate. Keep anchors within the same identifiable item or extension block.
5. If no reliable location remains, return an unmapped result and preserve the JSON location.

For example, two questions may contain the same %patient.name.given.first() expression. Its text alone cannot identify the affected question. A matching linkId may resolve it; otherwise the mapper must not guess.

## 7.2 Result contract

```ts
export interface SourceLocation {
  file: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}
export type SourceMapResult =
  | {
      status: 'mapped';
      confidence: 'exact' | 'anchored';
      location: SourceLocation;
    }
  | {
      status: 'unmapped';
      reason: 'ambiguous' | 'multiline' | 'not-found' | 'source-unavailable';
    };
export interface SourceMap {
  locate(site: ExpressionSite): SourceMapResult;
}
```

exact means one literal matched in the identified resource. anchored means item or declaration information resolved several matches. Neither label claims a compiler-generated mapping. An unmapped result carries no invented FSH coordinates.

Ranges cover expression text excluding its surrounding quotes, or the expression inside {{...}}. Internal lines and columns are one-based, columns count UTF-16 code units, and end positions are exclusive. Reporters convert these conventions where necessary.

Escaped quotes and backslashes make source offsets differ from decoded-string offsets. The mapper must track that correspondence when calculating fragment ranges or diagnostic carets. It must also handle LF and CRLF line endings.

SUSHI's index is at definition level, not at individual expression level. Its importer exposes rule positions but does not directly map FSH paths to JSON Pointers. For example, extension[variable][1] identifies the second member of a slice, not necessarily JSON array element 1. An importer-based mapper remains an alternative for RuleSets, multiline expressions or cases the search backend cannot resolve.

## 7.3 CLI and exit behavior

```
npx sdc-questionnaire-lint <globs>
  [--config <path>] [--preset sdc] [--fsh-dir <dir>]
  [--format text|github] [--json <path>] [--sarif <path>]
```

| Exit code | Meaning |
| :- | :- |
| 0 | No unsuppressed errors; warnings and information may remain |
| 1 | One or more unsuppressed rule errors |
| 2 | Configuration, input or execution failure; analysis did not complete successfully |

Findings are written before returning exit code 1, so CI can retain reports from failed checks.

## 7.4 Output formats **[[C3]](#c3)**

| Format | Content and purpose |
| :- | :- |
| Text | File, line, column, severity, rule ID and message; expression excerpt and caret where available |
| GitHub | Annotations for mapped findings, run-level notices for unmapped findings, complete job summary and log |
| JSON | Versioned findings schema with original JSON locations, optional FSH locations and mapping status. Technical detail is in separate fields |
| SARIF | Code-scanning results with rule metadata, repository-relative locations and stable fingerprints |

Message style. Messages are written for Questionnaire and IG authors, not tool developers. Each message:

- names the item by its text and linkId, and the variable or expression involved;
- says what is wrong and what it means for the form, in author terms (e.g. "this field will not prefill");
- suggests a fix;
- gives the FSH file and line only when the mapping is reliable. Otherwise it gives the file and item, and never a guessed line number.

Messages do not use implementation terms such as "scope", "AST" or "evaluation context". Technical detail (JSON path, parser output, analysis notes) is available in the JSON and SARIF fields and with --verbose.

Rule messages are reviewed as part of rule review. The rule documentation shows one example message for each rule.

Example diagnostic:

```
input/fsh/Example.fsh:42:18: error sdc/undefined-variable Undefined variable %patientNmae. Did you mean %patientName?
  %patientNmae.exists()
  ^~~~~~~~~~~~
```

Variable suggestions use names visible at that site. The text output has a stable first-line format so a VS Code problem matcher can populate the Problems panel without a custom editor extension. Unmapped findings use the compiled file and JSON Pointer; source coordinates are included only if known.

GitHub limits inline reporting, so the complete findings must also appear in the job summary and log. SARIF uses mapped FSH locations where available; unmapped results retain their compiled JSON location and a marker explaining the fallback. Such results may have no browsable source in GitHub when generated files are untracked.

Fingerprinting uses rule and resource identity plus the most stable available site identity. It must not depend only on an FSH line number, which moves during editing. Repeated uploads and moved source lines need explicit verification. GitHub's format requirements and pull-request display conditions are documented in [SARIF support for code scanning](https://docs.github.com/en/code-security/reference/code-scanning/sarif-files/sarif-support).

# 8. IG integration and author workflow

## 8.1 Files added to the IG

| File or change | Purpose |
| :- | :- |
| package.json and lockfile | Pin the linter and optional plugin. SUSHI follows the latest release to match the IG auto-build, and the version used is recorded in the report; provide generate, lint and lint:watch scripts |
| .gitignore | Exclude installed packages and generated reports |
| Linter configuration | Select core checks, optional compatibility target, FSH directories and explicit exceptions |
| .github/workflows/ci.yml | Run SUSHI and linting on pushes and pull requests; optionally upload SARIF |
| README instructions | Describe local commands, exceptions and VS Code integration |

The core check can be adopted independently of the Smart Forms plugin and optional profile. If the behavioural suite already has a workflow, add a job to that workflow.

## 8.2 CI behavior

CI installs the pinned linter and the current SUSHI release, runs SUSHI and lints the generated Questionnaires. SUSHI failure stops linting, preventing checks against stale generated files. The lint job fails on errors and completes successfully with warnings or information alone.

Before merging the integration or later form changes, fix findings in FSH or record justified exceptions in the same pull request. **[[C4]](#c4)**

The lint job starts as report-only and does not block merging. After a trial period with false positives resolved and existing findings fixed or recorded as exceptions, the IG maintainer may make errors a required check. From then on, fix findings in FSH or record justified exceptions in the same pull request.

SARIF upload is optional and enabled by the repository owner. It requires security-events: write; the normal lint job needs no such permission.

The existing Auto-Build process continues independently. The proposed lint workflow does not run Publisher or turn Publisher's validation results into a required PR check. A successful lint job therefore does not establish that all FHIR Validator checks passed.

## Decided not to implement (below):

## 8.3 Local editing

After installing dependencies, authors run npm run lint:watch **[[C5]](#c5)**. A change under input/fsh/ triggers SUSHI followed by the linter. Only a successful SUSHI build is linted, and overlapping rebuilds must not race against partially generated output.

The terminal displays findings with the same rule IDs and locations used in CI. The README provides a VS Code task and problem matcher for opening affected locations from the Problems panel.

# 9. Optional SmartFormsQuestionnaire profile **[[C6]](#c6)**

## 9.1 Purpose and ownership

The optional profile adds selected compatibility constraints to FHIR validation. The form claims the profile through meta.profile, allowing the constraints to run wherever that profile is available to the validator.

The linter remains useful without the profile. Adopting the profile is a separate conformance decision; it changes what the form declares about itself.

For reuse across forms, the proposed home is aehrc/smart-forms-ig, which GP CCMP would depend on. Hosting it initially in gpccmp-fhir-ig is an alternative, not an additional copy of the same profile. Decide its owner, canonical URL and supported component versions before adoption.

## 9.2 Candidate constraints

The source proposal groups profile checks under three invariant keys. Their exact coverage must be established against the compatibility matrix; they must not be described as equivalent to all eight plugin rules.

| Key | Proposed coverage | Required qualification |
| :- | :- | :- |
| sf-q-lang | Language restrictions corresponding to the two language-related compatibility rules | Apply the whitelist per expression location and consuming component. Allowing FHIRPath and x-fhir-query everywhere would accept queries at sites that only evaluate FHIRPath. |
| sf-q-unique | Declaration collisions associated with the shared runtime context | Include the root and descendant declarations that the relevant component actually stores together. A blanket list of every named expression needs evidence before it becomes a compatibility constraint. |
| sf-q-repeat | variable declarations on or below repeating items | Include the repeating item itself. Exclude itemPopulationContext merely used to create repeat instances. |

These checks can cover parts of four plugin rules. The unavailable-variable, query-embedding, template-context and named-expression-reference rules remain linter checks. Uniqueness cannot establish whether a named expression is available for reference.

---

# Comments

All six threads are open, last modified 2026-09-29. Listed in document order.

<a id="c1"></a>
## C1 — §2.3 Compatibility matrix, the two `compat` examples

**Liam Barnes:** Is it possible / a good idea to be able to pin to the latest version?

**Alex Pavlushkin:** Yes, that is a good idea.
- Default: "smart-forms": "latest". This is one value, not three, and it means the newest versions in the installed plugin's matrix.
- Updates come as PRs. The plugin is locked, so "latest" only moves when Dependabot or Renovate opens a PR to bump it. That PR shows any new findings, so a Smart Forms upgrade never silently breaks the IG's checks.
- Exact versions stay optional, for anyone who has to match a specific older deployment.

<a id="c2"></a>
## C2 — §4.1 heading "Core rules: sdc"

**Liam Barnes:** Can a rule be included that checks a variable that uses x-fhir-query has an expression that looks like a query? I'm assuming that parse-error checks a variable expression with language fhirpath has an expression that is fhirpath.

What I'm trying to check is if a a variable is added with a FHIRpath expression but accidentally added the from x-fhir-query language.

**Alex Pavlushkin:** Yes, it is a good point. Your reading of sdc/parse-error is right: it only checks expressions marked as FHIRPath, so a FHIRPath expression mistakenly marked as x-fhir-query would get past it. Smart Forms would send it to the server as a URL, the request would fail, and the fields would stay empty with no clear error. I'll add sdc/query-syntax. It flags any x-fhir-query expression that isn't a valid FHIR query and suggests switching the language to text/fhirpath when the expression looks like FHIRPath.

<a id="c3"></a>
## C3 — §7.4 heading "Output formats"

**Liam Barnes:** The output messages will need to be targeted to an IG/Questionnaire author and not a developer...so they are interpretable by the author.

**Alex Pavlushkin:** Got it. We will adjust messages to non-developers

<a id="c4"></a>
## C4 — §8.2, "Before merging the integration or later form changes, fix findings in FSH or record justified exceptions in the same pull request."

**Liam Barnes:** We would definitely need to test this out before integrating it in a way that would block merging.

**Alex Pavlushkin:** Agreed. The rollout will be in two stages:
1. Report only: the lint job runs on every PR and publishes findings but never blocks a merge. We use this stage to fix false positives and poorly worded messages.
2. Blocking: once the findings on the current IG are fixed or have recorded exceptions, and you're happy with the signal, errors become a required check.

<a id="c5"></a>
## C5 — §8.3, "lint:watch"

**Liam Barnes:** For me, I can't see this mode being useful. Maybe useful for others? Auto-saving in my editor would trigger sushi and the linter on insignificant changes.

**Alex Pavlushkin:** I'll remove it. Running linter on every auto-save may be noisy and slow. Authors can run npm run lint when they want to, which does SUSHI then lint.

<a id="c6"></a>
## C6 — §9 heading "Optional SmartFormsQuestionnaire profile"

**Liam Barnes:** Better to leave this out. smart-forms-ig is actually a use case specific IG for First Nations Health Check. Potentially this might be a good future idea for Smart Forms, but should really be included in an application specific IG and cover broader capabilities.

**Alex Pavlushkin:** Agreed, thanks for the context on smart-forms-ig. I've removed this. The linter doesn't depend on it.
