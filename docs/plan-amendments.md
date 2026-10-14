# Plan amendments

Decisions that override [core-plan.md](core-plan.md). The plan is a dated copy of a Google Doc and its body still carries the older text. Later decisions below take precedence over earlier decisions on the same point.

Where the plan and [linter-design-guidelines.md](linter-design-guidelines.md) differ on a point not listed here, ask before choosing.

## From the plan's comment threads

- **§2.3, §6.2 compat (C1):** the default is `"smart-forms": "latest"`, a single value meaning the newest versions in the installed plugin's matrix. Exact per-component versions stay optional.
- **§8.2 rollout (C4):** the lint job is report-only first and becomes a required check only after the trial. The paragraph requiring fixes "before merging the integration" is superseded.
- **§8.1, §8.3 `lint:watch` (C5):** removed. Authors run `npm run lint`, which runs SUSHI then the linter.
- **§9 SmartFormsQuestionnaire profile (C6):** removed.

## From reconciling the plan with the design guidelines (2026-10-01)

- **§4.1 `sdc/shadowed-declaration`:** default severity is `info`. This deliberately departs from SDC, which says a warning SHOULD be generated: SDC also says redefining a name in a descendant item is not an error and is common in modular forms.
- **§7.4 fix hints:** `message` states the problem only. The fix goes in a separate `help` field, phrased as an assertion: `help: a variable with a similar name exists: %patientName`. The plan's "Did you mean …?" example is superseded.
- **§6.3, §7.3 stale suppressions:** a suppression that matches nothing is reported as a warning. Making it an error in CI with `--strict-suppressions` is deferred; see the CLI design session below.

## From the CLI design session (2026-10-01)

- **§7.3 CLI, and guidelines §4 output modes:** superseded by [cli.md](cli.md). The first version has `lint` and `explain` commands and `--format text|json`.
- **§6 config:** a `files` field supplies the default paths for `lint`. The config is discovered in the current directory only.
- **`--strict-suppressions`:** deferred until the blocking CI stage. Until then a stale suppression is a warning, reported as `lint/stale-suppression`.
- **§5.2 namespaces:** `lint` is reserved for findings about the linter's own configuration; plugins may not use it.

## From the CLI DX and agent review (2026-10-01)

- **§6.3 suppression assessment:** explicit CLI paths make a targeted run. Suppressions outside its selected files are not assessed. A full run uses config/default inputs and also detects confirmed deleted files named by suppressions. Existing targets outside that selection remain not assessed. For an existing site, lack of a finding establishes staleness only when the suppressed rule could complete the applicable check. See [cli.md](cli.md#stale-suppressions) for the full assessment contract.
- **§3.1, §6 input selection:** CLI paths, config `files`, and default inputs are precedence levels, not fallback attempts. Each missing selected path or unmatched glob/directory selection fails the run. Deduplicate canonical input files; exclude `.git`, `node_modules` and directory-symlink traversal from recursive discovery.
- **§6 path bases:** CLI paths and `--config` are relative to the working directory. Paths inside a config and implicit input/source defaults are relative to the selected config's directory, or the working directory when no config is used. Report paths are relative to the working directory. `files` is a non-empty array; `source.fsh` is an array, with `[]` omitting source lookup.
- **§7.3 failures:** once a valid JSON-format lint invocation is recognized, handled failures emit a versioned `status: "failed"` document with a stable failure code and exit 2. Completed analysis uses `status: "completed"`, including exit 1. Partial findings are discarded on failure. Human-readable failure text remains on stderr.
- **§7.2, §7.4 machine contract:** [report-format.md](report-format.md) and its [JSON Schema](schemas/lint-report.schema.json) define the report and finding records, with [complete examples](examples/reports/README.md). Source mapping retains the plan's nested `location` union. Configuration findings use a config entry pointer rather than an invented Questionnaire site. Suggestions carry explicit edit targets and expected old text; this does not add autofix.
- **§7.4 fallback locations:** unmapped text findings include resource identity, resource/site JSON Pointers, the available expression excerpt and the source-mapping reason. Item text and linkId are context, not the sole locator.
- **§7.4 coverage:** reports include the linter and plugin versions, resolved compatibility versions, files read/skipped, expressions analysed/unchecked, suppressed findings and suppression assessment counts. Available FSH sources are an array. Info-only runs are not described as having zero findings.
- **§7.3 command ergonomics:** `--show-info` changes text visibility only. `--config` is shared by `lint` and `explain`; the latter lists registered rules, including configured-off rules, with default/effective severity and enabled status. Top-level and command-level `--help`/`--version` succeed without loading config, plugins or inputs.
- **§8.1 automation:** the [CLI recipe](cli.md#author-and-automation-recipes) runs SUSHI before linting, separates build logs from JSON, retains reports from nonzero lint exits and preserves the linter's exit status. A build failure stops before a new lint report is produced.

## From the CLI naming decision (2026-10-01)

- **§2.1, §7.3 executable names:** the npm package is `sdc-questionnaire-lint`; its primary executable is `sdc-lint`. Both `sdc-lint` and the `sdc-questionnaire-lint` executable alias ship in v1 and use the same implementation. This supersedes deferring a short alias. Help, usage examples and IG scripts use `sdc-lint`.
- **§6, §7.4 package identity:** config filenames, library imports, plugin package names and the report's `run.tool.name` retain `sdc-questionnaire-lint`. Choosing an executable name does not change report content or behavior.

## From slice 5, `sdc/unknown-function` (2026-10-06)

- **§4.1 `sdc/unknown-function` catalogue:** the catalogue is the keys of `engine.invocationTable` in the pinned fhirpath.js 4.10.1, the version Smart Forms' lockfile resolves (its packages declare `^4.10.1`); it supersedes "the pinned FHIRPath and SDC function catalogue". fhirpath.js fails whenever a call to any other name is evaluated, even on an empty collection, so the rule defaults to `error`. A call that is never evaluated, such as one in an untaken `iif` branch, does not fail. A FHIRPath specification function that fhirpath.js lacks is reported too. `packages/core/src/analysis/fhirpath-function-catalog.ts` is generated from the installed fhirpath.js source by `npm run generate:functions --workspace sdc-questionnaire-lint`, and a test fails when the file differs from what the generator produces.
- **§4.1 `sdc/unknown-function` scope:** calls on `%factory` and `%terminologies` are not checked, because those objects' own functions are not in the catalogue. A misspelt function on them, such as `%factory.Codingg()`, still fails in fhirpath.js and goes unreported. An expression that does not parse gets no `sdc/unknown-function`; the `sdc/parse-error` finding stands alone.

## From the source-mapping design (2026-10-07)

- **§7.1 SUSHI index:** an index entry is used only when its `fshFile` resolves inside a configured FSH directory and the line at `startLine` is `Instance: <fshName>`. Otherwise the entry is stale and the mapper searches as if it were absent. A missing, malformed or stale index never fails the run.
- **§7.1 search without an index entry:** the mapper scans the FSH directories for an `Instance:` whose effective id (its `id` rule, otherwise its name) and `InstanceOf` match the resource. `InstanceOf` matches when it is the resource type, or a profile in the FSH directories whose `Parent:` chain reaches it. No match, or more than one, leaves the finding `not-found`.
- **§7.1, §7.2 `exact`:** the expression text must be unique in both the resource's JSON and the FSH definition, and that one literal must have the expression's anchors (below); a literal without them leaves the finding `not-found`. A literal that a later rule of the definition assigns over, or one in a contained resource, is not counted. This supersedes "one literal matched in the identified resource".
- **§7.1 anchors:** repeated text is resolved by item linkId, extension (its URL, an alias of it, or the URL's last path segment) and Expression name. `anchored` needs exactly one FSH literal and exactly one expression site in the JSON with the same anchors; anything else is `ambiguous`. In a definition that contains an `insert` rule, repeated text is never anchored.
- **§7.1 scope:** expressions produced by parameterised RuleSets are `not-found`; `"""` literals and `"…"` literals that span lines are `multiline`. A finding with no expression text is `not-found`. The report summary does not count mapping coverage.
- **§7.2 decoding:** a decoded FSH string literal is always the value SUSHI's `unescapeQuotedString` gives it. The mapper also reads the literal one escape at a time, to know where each character came from. SUSHI's chain of replacements decodes differently only when a `\u005C` escape makes a backslash that starts the next escape, as in `\u005Cn`, which SUSHI decodes to a newline. The source of such a character cannot be told, so that literal is not decoded and its finding is `not-found`. Before returning coordinates the mapper decodes the source of the reported range on its own, and returns `not-found` if it is not the range's text.
- **§7.2 `SourceMap`:** the interface is internal, not public API. Mapping runs in `lint()` after suppressions, only on findings that will be reported, and reads FSH files only when a Questionnaire finding remains. It never changes fingerprints, summary counts or analysis.
- **§7.2 failures:** an exception inside the mapper leaves that finding `not-found`; it never fails the run with `INTERNAL_ERROR`.

## From the core rules plan (2026-10-08)

Each bullet states the override; the reasons and the implementation are in [core-rules.md](core-rules.md), under the cited decisions (Dn).

- **§3, §5.2 shared analysis (D15, D18):** declarations, variable references and available variables are computed once per document and stay internal to core. The public `Scope`/`scopeAt` stub is unchanged. `RuleFinding` gains `relatedLocations`.
- **§3.1 declarations (D9, D16, D17):** any named expression at a catalogued location declares its name, and so do launchContext and extractAllocateId names. sourceQueries results do not. `ExpressionSite.declares` changes to match, and fingerprints of the affected findings change once.
- **§3.1 catalog use cases (D20):** use cases follow the SDC expressions table, so `ExpressionSite.useCases` values change.
- **§3, §4.1 availability (D8, D12, D13, D19):** a name is available on its element and descendant items, in any order, whatever the declaring expression's use cases. Extraction sites see only extractAllocateId names, named extraction contexts, built-in names and host variables.
- **§3.1 deferred content:** Library content behind `Expression.reference`, whole-string FHIRPath carriers and CQL are not analysed.
- **§3.1 generic discovery (slice 6 review):** outside catalogued locations, an object with a string `language` and either string `expression` or string `reference` is an expression site. Reference-only Expressions remain unchecked and block an unused-variable finding when they are plausible consumers (D5).
- **§4.1 `sdc/language-not-in-value-set` (D11):** accepts the R4 and R5 codes, six in all. Both query codes are analysed as queries.
- **§4.1 `sdc/language-not-allowed` (D3, D10):** enforces only the expressions-table restrictions the Validator does not; contextExpression allows any language.
- **§3 module names (D24):** the names a module lists in `sdc-questionnaire-assembleContext` are available at every site of that module, without being declarations.
- **§3 a declaration's own name (D25):** in a declaration's own expression, its own name resolves to the next binding outward, and to the declaration itself only when nothing else supplies it.
- **§4.1 reserved names (D23):** declaring a reserved name such as `%qitem` is an error with its own check, `sdc/reserved-name`.
- **§4.1 `sdc/unused-declaration` (D4, D5):** reports only `variable`, and only when every plausible consumer was analysed. Supersedes "in the applicable use cases whose consumers are present".
- **§4.1 `sdc/dependency-cycle` (D21):** defaults to `warning`, one finding per cyclic component. A future error needs a separately specified, proven failure class.
- **§4.1 `sdc/unresolved-linkid` (D6, D7):** defaults to `warning`, checks only bounded selectors, and excludes deliberate absence probes. An uncertain target produces no finding and leaves the site unchecked. Supersedes "reported as unchecked at info".
- **§4.3, §6.1 `hostVariables` (D1, D2, D16):** a config array of names the host supplies, available at every site. `lint/unused-host-variable` is deferred.
- **§6.3 suppressions (D22):** a suppression can target a launchContext or extractAllocateId declaration by element and name.
- **Rule review (D7, D14):** each core rule is checked against a local, uncommitted corpus, and an error-severity rule merges only with zero false-positive errors on it. PRs report finding changes without expression excerpts from forms whose terms restrict redistribution.

## From the Smart Forms rules plan (2026-10-09)

Each bullet states the override; the reasons are in [smart-forms-rules.md](smart-forms-rules.md), under the cited decisions (Sn). The plan's other decisions are proposals until accepted, and a slice merges once every decision it cites is accepted.

- **§2.1, §4.2 supported integration (S1):** plugin rules check population followed by rendering, assuming population succeeded. Template extraction is checked only when selected in `compat`. A renderer used without population, and a run where population failed, are outside the supported integration.
- **§2.3 compatibility matrix (S3, S4):** core validates `compat` and resolves it against the versions the plugin declares in `LintPlugin.compat`. An explicit object names renderer and populate and may omit template-extract; there is no per-component `"latest"` and no nearest-version fallback. Each component's versions are listed oldest to newest, `"latest"` takes the last, and core never compares versions. Each component's versions are verified independently, and any combination of listed versions is accepted. The matrix is small typed runtime facts in the plugin, each with its evidence, not a universal entry schema; a fact does not name a rule.
- **§2.1 evidence (S11):** runtime evidence is cited at the release commit of the package it belongs to, after checking the file is identical there.
- **§6.1, §6.2 `presets`, `languages` and rule options (S7):** not added. Listing a plugin enables its rules at their defaults, and deployment facts belong in `compat` or `hostVariables`. The plan's examples that use `presets` and `languages` are superseded.
- **§5.3 peer range:** before the first release, the plugin's peer range stays `^0.1.0`.

Accepted with P1 (2026-10-09):

- **§4.2 locations (S2):** plugin rules map a location to a component through the plugin's runtime facts, never through `site.useCases`. `smart-forms/expression-evaluated-as-fhirpath` (core-plan's `unchecked-language-evaluated-as-fhirpath`, S17) also checks populate's initialExpression and itemPopulationContext.
- **§5.2 core API for plugins (S5):** core publishes analysis to plugins in stages, each with the slice that first needs it. Stage A exports the language lookups `definedLanguages`, `languagesAllowedAt` and `isQueryLanguage` ([architecture.md](architecture.md#what-a-plugin-can-import)).
- **§4.2 overlap with core (S9):** a plugin rule stays silent where a core rule or the Validator reports the same root cause, by checking the condition itself, never whether that rule ran.
- **§2.1 reproduction tests (S10):** every runtime fact has a reproduction test against the pinned npm package where a harness exists; until then it is `source-only`, with a permalink, and messages based on it claim only what the source shows.

Accepted with P2 (2026-10-09):

- **§5.2 core API for plugins (S5, D15, D18):** API stage B replaces the `scopeAt` stub and the `Scope` type with `RuleContext.referencesAt(site)` and `RuleContext.variablesAt(site)`, and exports the types they return: `VariableReference`, `AvailableVariables`, `Variable`, `Declaration` and `DeclarationKind`. D15 and D18 are lifted for these types; dependencies and uses stay internal until P5. `undefined` means the analysis is unavailable at the site, and is distinct from `[]`. Core and the plugin stay at 0.1.0 before the first release, so 0.1.0 is the version that ships stage B.
- **§4.3 host-supplied `%questionnaire` and `%qitem` (S13):** a host that supplies either name through Smart Forms' `additionalContext` records a suppression with a reason naming the host; `hostVariables` cannot express it, because config rejects built-in names. This does not apply to an answerExpression: the renderer builds its context from the name before the first `.` alone, and `additionalContext` never reaches it, so no host can supply the name there.
- **Reproduction dependencies:** `@aehrc/sdc-populate@4.7.1` declares `fhirclient`, which it never imports at run time and which pulls in about 500 Expo and React Native packages. An npm override replaces it with an empty local stub, `test/stubs/fhirclient`. A new `sdc-populate` version must re-check the override, which names 4.7.1.
- **§4.3 `smart-forms/questionnaire-variable-unavailable` silence (S9):** the rule is silent for a name any declaration in the form has, wherever it is. `sdc/reserved-name` reports that declaration, which is the root cause. This claims nothing about whether the declaration supplies a value at run time.
- **§4.3 `smart-forms/questionnaire-variable-unavailable` message:** the message states the consequence of the failed evaluation at each location, which leaves the previous result in place. An answerExpression gets its own message, because the renderer never evaluates one whose head is the name ([smart-forms-rules.md](smart-forms-rules.md#p2-smart-formsquestionnaire-variable-unavailable)).

Applied with P3 (2026-10-11):

- **§4.2 `smart-forms/x-fhir-query-embedding-shape`:** built as `smart-forms/unsupported-query-embedding` (S17). Its scope is the `{{…}}` embeddings in named `application/x-fhir-query` variables, on the root and on items, which population fetches. "Not the supported `%launchContext.path` shape" is replaced by six checks, reproduced against `@aehrc/sdc-populate@4.7.1`: population does not recognise the embedding, the Questionnaire declares no launch context, the text is not a valid regular expression, the regular expression does not replace exactly its own embedding in every query, the head is not a launch context, or the path references a name population does not supply. Operators and literals are replaced, so they are not reported; the failures come from the unescaped regular expression population builds ([smart-forms-rules.md](smart-forms-rules.md#p3-smart-formsunsupported-query-embedding)).

Accepted for P4 (2026-10-12):

- **§5.1 execution model (S6):** core-plan says that plugins "do not subscribe to walker callbacks and do not extend the registry through this interface", so a plugin only reads core's analysis. A plugin may now also supply names to that analysis, through an optional, synchronous hook, `LintPlugin.hostVariables({ document, compat })`, where `compat` is the plugin's resolved versions as its rules get them. Core calls it once per Questionnaire, before analysing it, whether or not the plugin's rules are enabled, drops names FHIRPath, FHIR or SDC define, and merges the rest with config `hostVariables`; they are host variables like any other. A throw, a promise or an invalid result fails the run with a new failure code, `PLUGIN_CRASH`, which names the plugin and its version. The hook adds names only: it cannot remove a name, a declaration or a finding, and it sees nothing of core's internal analysis. The Smart Forms plugin supplies only the sourceQueries result names population binds a value to. The `additionalContext` names an application passes stay in config `hostVariables` (core-rules D1), because they belong to the host, not to Smart Forms.
- **core-rules D1, built-in names in `hostVariables`:** a config entry that FHIRPath, FHIR or SDC defines (`builtinNames`, or a `vs-` or `ext-` prefix) is `CONFIG_INVALID`. Such an entry never supplied a value: built-in names resolve first, except `qitem`, which a listed entry made available at the root. A host that supplies `%questionnaire` or `%qitem` records a suppression with a reason (S13).
- **§5.2 core API for plugins (S5):** `RuleContext.declarations`, every declaration of the document, frozen, is published in the contract-hardening slice H before P4 (stage B2), not with P5's stage C; `ctx.sites` is frozen as an array too. `questionnaire-variable-unavailable`'s silence for declared names needs the form's declarations, and P6 needs them as well.

## From the GitHub and SARIF formats (2026-10-12)

Issue #31. [cli.md](cli.md#github) and [cli.md](cli.md#sarif) hold the contract.

- **§7.3, §7.4 formats:** `--format` takes `github` and `sarif` as well as `text` and `json`, each on stdout. File sinks (`--json <path>`, `--sarif <path>`) stay deferred, so one run writes one format.
- **§7.4 GitHub run-level notices:** an unmapped or configuration finding is annotated with its own severity, `::error`, `::warning` or `::notice`, and no file position. The plan's "run-level notices for unmapped findings" is read as "annotations without a position", so an unmapped error still counts as an error.
- **§7.4 GitHub job summary:** written to the file `GITHUB_STEP_SUMMARY` names, when set; the full findings are also in the log. A summary that cannot be written is a warning on stderr and leaves the exit status alone.
- **§7.3 failures in github and sarif:** a recognized `github` or `sarif` selection gets a failure document on stdout, as `json` does: one `::error` annotation and a summary section without counts, or a SARIF log with `executionSuccessful: false` and no `results`. An absent `results` keeps code scanning from closing open alerts; the CLI recipe skips the SARIF upload on exit 2 as well.
- **§7.4 SARIF locations and fingerprints:** artifact URIs are relative to `%SRCROOT%`, the working directory. `partialFingerprints.primaryLocationLineHash` carries the report's fingerprint, so upload-sarif does not compute one from the source line. Whether GitHub honours both, and its reading of `endColumn`, is checked against a real repository before the formats are relied on.
- **§7.4 unique fingerprints:** a Questionnaire finding's fingerprint also has the text of its expression range, and a fingerprint that would repeat in a report is made distinct by its occurrence. Two findings of one rule in one expression were otherwise one code-scanning alert. Every fingerprint of a finding with a range changed once.

## From the Smart Forms P5 review (2026-10-13)

Settled before building P5; the reasons are in [smart-forms-rules.md](smart-forms-rules.md#settled-in-the-p5-review).

- **§4.2 `smart-forms/flat-variable-context` (built as `smart-forms/variable-name-collision`, S17):** "declarations that the component stores in one shared context" means the names Smart Forms' readers bind: variables in `text/fhirpath` or `application/x-fhir-query`, the itemPopulationContexts populate reads, and launchContexts under the name Smart Forms reads, which can differ from core's. The sourceQueries result names the plugin supplies collide too, although they are not declarations. A name FHIRPath, FHIR or SDC defines, and a second declaration of a name on one element, are left to `sdc/reserved-name` and `sdc/duplicate-declaration` (S9).
- **§4.2 `smart-forms/repeating-group-variable`:** "evaluated per instance" means the variable's value can differ between repetitions: it reads its input other than `linkId`, or depends on such a variable on the same item, in either order. A variable nothing references is not reported.
- **§5.2 core API for plugins (S5):** stage C also exports `definerOf` and `BuiltinDefiner`, so a plugin rule can stay silent where `sdc/reserved-name` reports without copying core's list of built-in names. `RuleContext.readsInput(site)` does not count a read of only the input's `linkId`.

## From the Smart Forms P6 review (2026-10-13)

Settled before building P6; the reasons are in [smart-forms-rules.md](smart-forms-rules.md#settled-in-the-p6-review).

- **§4.2 `smart-forms/named-expression-not-referenceable` and population (S14):** under S1, a name only population makes available, such as an itemPopulationContext's, is not reported at a renderer site, because population's context reaches the renderer as `additionalContext`. An answerExpression is the exception, below.
- **§4.2 `smart-forms/named-expression-not-referenceable` at an answerExpression:** the renderer gives an answerExpression a context of its own with one name, the text between its first `%` and first `.`, and only when that names a launch context or an `application/x-fhir-query` variable whose expression is a ValueSet URL. The rule reports a head that is neither, and every other reference in the expression, names supplied by the host or by sourceQueries included. Populate-only names that S14 lets through at other renderer sites are reported there.
- **§4.2 `smart-forms/named-expression-not-referenceable` and host names:** a reference that resolves to a declaration Smart Forms does not make available gets the same finding when config `hostVariables` or an assembleContext name also supplies the name. The message does not claim which value the reference gets, nor that the reference fails: it says the reference never gets the declaration's value.

## From the Smart Forms P7 review (2026-10-13)

Settled before building P7; the reasons are in [smart-forms-rules.md](smart-forms-rules.md#settled-in-the-p7-review).

- **§4.2 new rule `smart-forms/forward-variable-reference` (S12, warning):** a `text/fhirpath` variable population evaluates references, at a position fhirpath.js always evaluates, a variable population evaluates later (a later root variable, a later variable on the same element, or an ancestor item's variable later in population's linkId key order) or an itemPopulationContext population reads. Population fails the reference, so the variable has no value while the form is prefilled. The rule reports only when population runs and an initialExpression or itemPopulationContext population reads uses the variable, directly or through other variables, and stays silent when an earlier binding of the name supplies a value instead.
- **§4.2 rule IDs (S17):** `unchecked-language-evaluated-as-fhirpath` is built as `expression-evaluated-as-fhirpath`, `x-fhir-query-embedding-shape` as `unsupported-query-embedding`, `flat-variable-context` as `variable-name-collision`, and the new D8 rule is `forward-variable-reference`.
- **§4.2 overlap with core (S9):** `forward-variable-reference` and `repeating-group-variable` may report the same variable: reordering fixes population, while every repetition still shares one value.
- **§5.2 core API for plugins (S5):** stage D adds `VariableReference.conditional`, true when fhirpath.js may skip evaluating the reference: an `iif` argument after the criterion, a `coalesce` argument after the first, or an argument evaluated per item of its target (`where`, `select`, `exists`, `all`, `repeat`, the first of `aggregate`, `sort`'s selectors), and every reference below one. The change is additive.

## From the Smart Forms P8 review (2026-10-13)

Settled before building P8; the reasons are in [smart-forms-rules.md](smart-forms-rules.md#settled-in-the-p8-review).

- **§4.2 rule ID (S17):** `smart-forms/template-extract-context-string-only` is built as `smart-forms/unsupported-template-extract-context`.
- **§4.2 `smart-forms/unsupported-template-extract-context` scope:** the rule reports a templateExtractContext with a `valueExpression` and no `valueString` only in a template Smart Forms extracts: a top-level contained resource referenced by the first `#id` `template` slice of an item's `templateExtract`. A template referenced only from the Questionnaire root is never extracted by template-extract 1.0.15, so it is not reported. It reports only where the Expression is an expression site, so a context with no `language` is left to the Validator, and only the first templateExtractContext in an `extension` array, outside the template resource's own `extension`.
- **§6.3 suppressions:** unchanged. Suppression of a finding reported with only a JSON pointer, planned in P8, is deferred to an open item in smart-forms-rules.md.

## From the Smart Forms open-items review (2026-10-14)

Settled after P8; the reasons are in [smart-forms-rules.md](smart-forms-rules.md#settled-in-the-open-items-review).

- **§6.3 suppressions and plugin rules (S8):** a suppression of a plugin finding is applied or stale as usual, but a target with no plugin finding is not assessed: plugin rules take part in no completion evidence and never make a site unchecked.
- **§4.2 Smart Forms rules (S15):** no rule for the renderer's answerExpression fallback, or for `%context` being `{}` at most Smart Forms evaluators.
- **§5.2 plugin contract (S19):** `RuleContext.options` is removed; rule options are not built (S7). Findings carry their rule's `docsUrl`.
- **§7 report (S19):** the compat versions in the report are a generic map from component to version, not fields named after Smart Forms components.

## From the Smart Forms P12 review (2026-10-14)

Settled before building P12; the reasons are in [smart-forms-rules.md](smart-forms-rules.md#settled-in-the-p12-review).

- **§5.2 plugin contract (Z):** a rule's `meta.docsUrl` must be an absolute URL that the report schema's `format: uri` accepts: RFC 3986 characters, well-formed percent-encodings, no `[` or `]`, at most one `#` and something after the scheme; otherwise loading the plugin fails.
