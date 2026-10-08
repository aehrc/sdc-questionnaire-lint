# Plan amendments

Decisions that override [core-plan.md](core-plan.md). The plan is a dated copy of a Google Doc and its body still carries the older text. Later decisions below take precedence over earlier decisions on the same point.

Where the plan and [linter-design-guidelines.md](linter-design-guidelines.md) differ on a point not listed here, ask before choosing.

## From the plan's comment threads

- **§2.3, §6.2 compat (C1):** the default is `"smart-forms": "latest"`, a single value meaning the newest versions in the installed plugin's matrix. Exact per-component versions stay optional.
- **§8.2 rollout (C4):** the lint job is report-only first and becomes a required check only after the trial. The paragraph requiring fixes "before merging the integration" is superseded.
- **§8.1, §8.3 `lint:watch` (C5):** removed. Authors run `npm run lint`, which runs SUSHI then the linter.
- **§9 SmartFormsQuestionnaire profile (C6):** removed.

## From reconciling the plan with the design guidelines (2026-10-01)

- **§4.1 `sdc/shadowed-declaration`:** default severity is `info`, because SDC allows redefining a variable in a descendant item.
- **§7.4 fix hints:** `message` states the problem only. The fix goes in a separate `help` field, phrased as an assertion: `help: a variable with a similar name exists: %patientName`. The plan's "Did you mean …?" example is superseded.
- **§6.3, §7.3 stale suppressions:** a suppression that matches nothing is a warning locally and an error under `--strict-suppressions`, which CI uses. The flag is added to the CLI.

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

- **§4.1 `sdc/unknown-function` catalogue:** the catalogue is the keys of `engine.invocationTable` in the pinned fhirpath.js, the engine Smart Forms runs; it supersedes "the pinned FHIRPath and SDC function catalogue". fhirpath.js fails on a call to any other name, even on an empty collection, so the rule defaults to `error`. A FHIRPath specification function that fhirpath.js lacks is reported too. `packages/core/src/analysis/fhirpath-function-catalog.ts` is generated from the installed fhirpath.js by `npm run generate:functions --workspace sdc-questionnaire-lint`, and a test fails when the two differ.
- **§4.1 `sdc/unknown-function` scope:** calls on `%factory` and `%terminologies` are not checked, because fhirpath.js resolves them against those objects' own functions. An expression that does not parse gets no `sdc/unknown-function`; the `sdc/parse-error` finding stands alone.

## From the source-mapping design (2026-10-07)

- **§7.1 SUSHI index:** an index entry is used only when its `fshFile` resolves inside a configured FSH directory and the line at `startLine` is `Instance: <fshName>`. Otherwise the entry is stale and the mapper searches as if it were absent. A missing, malformed or stale index never fails the run.
- **§7.1 search without an index entry:** the mapper scans the FSH directories for an `Instance:` whose effective id (its `id` rule, otherwise its name) and `InstanceOf` match the resource. `InstanceOf` matches when it is the resource type, or a profile in the FSH directories whose `Parent:` chain reaches it. No match, or more than one, leaves the finding `not-found`.
- **§7.1, §7.2 `exact`:** the expression text must be unique in both the resource's JSON and the FSH definition, and that one literal must have the expression's anchors (below); a literal without them leaves the finding `not-found`. A literal that a later rule of the definition assigns over, or one in a contained resource, is not counted. This supersedes "one literal matched in the identified resource".
- **§7.1 anchors:** repeated text is resolved by item linkId, extension (its URL, an alias of it, or the URL's last path segment) and Expression name. `anchored` needs exactly one FSH literal and exactly one expression site in the JSON with the same anchors; anything else is `ambiguous`. In a definition that contains an `insert` rule, repeated text is never anchored.
- **§7.1 scope:** expressions produced by parameterised RuleSets are `not-found`; `"""` literals and `"…"` literals that span lines are `multiline`. A finding with no expression text is `not-found`. The report summary does not count mapping coverage.
- **§7.2 decoding:** a decoded FSH string literal is always the value SUSHI's `unescapeQuotedString` gives it. The mapper also reads the literal one escape at a time, to know where each character came from. SUSHI's chain of replacements decodes differently only when a `\u005C` escape makes a backslash that starts the next escape, as in `\u005Cn`, which SUSHI decodes to a newline. The source of such a character cannot be told, so that literal is not decoded and its finding is `not-found`. Before returning coordinates the mapper decodes the source of the reported range on its own, and returns `not-found` if it is not the range's text.
- **§7.2 `SourceMap`:** the interface is internal, not public API. Mapping runs in `lint()` after suppressions, only on findings that will be reported, and reads FSH files only when a Questionnaire finding remains. It never changes fingerprints, summary counts or analysis.
- **§7.2 failures:** an exception inside the mapper leaves that finding `not-found`; it never fails the run with `INTERNAL_ERROR`.
