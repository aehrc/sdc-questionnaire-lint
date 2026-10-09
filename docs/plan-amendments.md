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
