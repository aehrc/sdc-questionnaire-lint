# CLI

The command-line contract for the first version. It supersedes plan §7.3 and the output-mode list in [linter-design-guidelines.md](linter-design-guidelines.md) §4. Configuration, suppression and reporting amendments are recorded in [plan-amendments.md](plan-amendments.md). Terms are defined in [CONTEXT.md](../CONTEXT.md).

The npm package `sdc-questionnaire-lint` provides `sdc-lint` as its primary executable and `sdc-questionnaire-lint` as an alias, both included in the first version. Both executable entries use the same implementation, arguments, output and exit codes. Help and documentation examples use `sdc-lint`. Config filenames and the report's `run.tool.name` use the package name.

The goal is that an author and an agent type the same command in an IG, with no flags:

```sh
sushi . && sdc-lint lint
```

The linter reads compiled JSON. Regenerate with SUSHI after editing FSH; a lint run alone does not establish that the generated files are current.

## Commands and common flags

| Command | Purpose |
| :- | :- |
| `sdc-lint lint [paths…]` | Check Questionnaires and report findings |
| `sdc-lint explain [rule-id]` | Print one rule's documentation; with no argument, list registered rules |

| Flag | Availability | Meaning |
| :- | :- | :- |
| `--config <path>` | Both commands | Use this config instead of discovery |
| `--help` | Top level and both commands | Print usage and examples to stdout; exit 0 |
| `--version` | Top level and both commands | Print the linter version to stdout; exit 0 |

Common flags may appear before or after the command. `--help` and `--version` do not load configuration or plugins, discover inputs, or require an IG. Top-level help lists commands; command help includes a default invocation and relevant explicit-path or config examples. Running with no command prints short usage to stderr and exits 2. Unknown commands, flags and extra arguments are usage failures. `--` ends option parsing so a path beginning with `-` can be supplied.

## Configuration and path bases

Discover `sdc-questionnaire-lint.config.json` or `sdc-questionnaire-lint.config.mjs` in the current working directory only. Parent directories are not searched. If both exist, fail with exit 2 and request an explicit `--config`. An explicit config that is missing, unreadable or invalid fails; it never falls back to discovery or defaults.

Without a config, the built-in `sdc` rules run at their default severities and the summary says no config was used. External plugins must be listed in an `.mjs` config; installing a plugin alone does not enable it.

| Path | Resolved relative to |
| :- | :- |
| CLI input paths and `--config` | Current working directory |
| Config `files`, `source.fsh`, and suppression `file` values | Directory containing the selected config, including an explicit `--config` |
| Implicit input directory, FSH directories and SUSHI index | Directory containing the selected config, or the working directory when no config is used |
| Paths rendered in reports | Current working directory |

Absolute input and config paths are accepted. Report paths use `/` separators. Config `files` is a non-empty array of file, directory or glob strings; an empty array is a config failure. `source.fsh` is an array of directories, defaulting to `["input/fsh"]`; `[]` explicitly omits FSH source lookup. The SUSHI index defaults to `fsh-generated/data/fsh-index.json` beneath the same base as the implicit inputs.

For example, when invoked from the parent of `ig`, `lint --config ig/sdc-questionnaire-lint.config.json` uses defaults beneath `ig`. An additional CLI path is still relative to the caller's working directory.

## `lint`

### Flags

| Flag | Default | Meaning |
| :- | :- | :- |
| `--format text\|json` | `text` | Output format on stdout |
| `--show-info` | false | Include info findings in text output |

`--show-info` affects presentation only. It does not change analysis, counts, suppressions or exit status. JSON always includes all severities; the flag has no effect with `--format json`.

### Input selection

Select exactly one list of inputs:

1. CLI paths, when supplied: a **targeted run**.
2. Otherwise, config `files`, when present: a **full run** over the configured inputs.
3. Otherwise, `fsh-generated/resources`: a **full run** over the default inputs.

This is precedence, not fallback. A missing CLI path does not cause config or default inputs to be checked instead. Supplying CLI paths always makes the run targeted, even if they happen to cover all configured files.

Paths are files, globs or directories. A directory expands to `**/*.json`. Globs support `*`, `?`, `**` and character classes; brace expansion and negated patterns are outside the first-version contract. Quote globs so the linter performs the expansion consistently:

```sh
sdc-lint lint "fsh-generated/resources/Questionnaire-*.json"
```

- Every selected literal path must exist. Each glob and directory must select at least one file after traversal exclusions. A missing path, unmatched glob or empty directory selection fails with exit 2 even when another path is valid.
- Recursive directory and glob expansion skip `.git` and `node_modules` directories and do not descend through directory symlinks. An explicitly named file is read even inside an excluded directory.
- Deduplicate overlapping inputs by canonical file path before reading. Use canonical paths, rendered relative to the working directory, for file identity and reporting. Distinct files containing the same resource are not deduplicated by resource ID.
- Malformed JSON or an unreadable selected file fails the run. Valid JSON files that are neither a Questionnaire nor a Bundle are skipped and counted. Bundles retain resources needed as local reference targets; a Bundle without a Questionnaire is not counted as a skipped file.
- A selection containing no Questionnaires fails with exit 2. The help names the selected inputs and suggests supplying paths or configuring `files`; when the default directory is missing, it also suggests running SUSHI.

### Sources and environment

Available FSH directories are used for source mapping. Missing optional FSH directories or a missing/unusable SUSHI index do not fail analysis. Without a usable index, the mapper may search the configured FSH directories and must establish resource identity before accepting a match. A finding without a reliable match retains its compiled JSON location and an explicit mapping reason.

The summary lists available FSH directories, or says none were found. An empty `source.fsh` is reported as source lookup omitted. The output does not change for agents, a non-TTY stdout or the `CI` variable. Only text colour depends on the TTY and `NO_COLOR`; JSON never contains colour or progress messages.

### Streams and exit codes

Completed runs write findings and the summary to stdout before exiting. Human-readable failures go to stderr as `error: <problem>` and `help: <fix>`.

| Code | Meaning |
| :- | :- |
| 0 | Analysis completed with no unsuppressed errors; warnings and info may remain |
| 1 | Analysis completed with one or more unsuppressed errors |
| 2 | The run did not complete: bad config, unreadable input, no Questionnaires found, a rule crash, or wrong usage |

In text mode, stdout stays empty on failure. Once a valid `lint --format json` selection is recognized, handled failures also write one structured failure document to stdout, including subsequent argument-validation failures. Unknown commands or an invalid/ambiguous format selection use stderr only. Process termination and failures before the CLI can start cannot guarantee a JSON document.

Buffer the report until analysis completes; a handled failure discards partial findings and does not emit a success-shaped summary. Config and plugin logging must not contaminate report stdout. A rule crash identifies its rule ID in both the failure record and stderr.

Findings are sorted identically in both formats: by displayed file, then known line and column (unknown positions last), then rule ID, then resource pointer and site/config pointer. Ties use the fingerprint. String comparisons are locale-independent. Counts are computed before text visibility filtering.

### `text`

```text
input/fsh/Example.fsh:42:18: error sdc/undefined-variable "Patient name" (patient-name) uses %patientNmae, which is not defined. This field will not calculate.
  %patientNmae.exists()
  ^~~~~~~~~~~~
  help: a variable with a similar name exists: %patientName

fsh-generated/resources/Questionnaire-Example.json: warning sdc/unused-declaration "Patient summary" (patient-summary) declares %age, which nothing uses.
  %patient.birthDate
  location: compiled JSON; Questionnaire/Example; /item/1/extension/0/valueExpression/expression
  note: FSH line not found, the expression appears more than once
  help: remove the variable, or reference it as %age

6 findings (1 error, 1 warning, 4 info) in 3 questionnaires. 4 info findings hidden; use --show-info.
Inputs: full run; 5 files read, 2 skipped. Expressions: 8 analysed, 1 unchecked. Suppressed findings: 0.
Suppressions: 0 applied, 0 stale, 0 not assessed.
Config: sdc-questionnaire-lint.config.mjs. FSH sources: input/fsh.
Linter: 0.1.0. Plugins: sdc@0.1.0, smart-forms@0.1.0.
Smart Forms: renderer 1.4.0, populate 4.7.1, template-extract 1.0.15.
```

Versions in examples are illustrative. The Smart Forms line is present only when that plugin runs; it always names the resolved component versions, including when config uses `latest`.

- The first line of each finding has a stable format: `file[:line:col]: severity rule-id message`.
- An unmapped finding names the compiled file without invented coordinates and adds a `location` line containing the resource identity and a file-relative JSON Pointer. For a Bundle or contained resource, include its resource pointer as well. If the resource has no ID, its resource type and pointer identify it. Show the expression excerpt when one is available, and the reason FSH mapping failed. Item text and linkId remain useful context, but are not the only locator.
- A configuration finding names the config file and its entry pointer, such as `/suppress/0`; it does not invent a Questionnaire location. For `.mjs`, this pointer addresses the exported config object.
- Errors and warnings are shown by default; `--show-info` also shows info. The summary always counts all unsuppressed findings. An info-only run says, for example, `4 findings (0 errors, 0 warnings, 4 info) in 3 questionnaires. 4 info findings hidden; use --show-info.`
- A run with no unsuppressed findings prints `0 findings in 3 questionnaires.` followed by the same coverage and configuration summary. Suppressed findings and unchecked expressions are still counted separately.

### `json`

One versioned document on stdout. [report-format.md](report-format.md) defines its fields, locations, counts and compatibility rules. The normative [JSON Schema](schemas/lint-report.schema.json) and [complete examples](examples/reports/README.md) cover completed, failed, mapped, unmapped and stale-suppression reports.

A completed report has `status: "completed"`, all unsuppressed findings, run metadata and a summary. This includes runs that exit 1. Metadata records the linter and loaded plugin versions and resolved compatibility versions. The summary records files read/skipped, Questionnaires, expressions analysed/unchecked, severity counts, suppressed findings, suppression assessment, config and available FSH directories.

A handled failure exits 2 and has this shape:

```json
{
  "schemaVersion": 1,
  "status": "failed",
  "failure": {
    "code": "INPUT_NOT_FOUND",
    "path": "missing.json",
    "message": "Input file does not exist.",
    "help": "Check the supplied path."
  }
}
```

Failure codes identify the cause without parsing `message`. A failed report has no `findings`, `run` or `summary` fields, so it cannot be mistaken for a completed clean run. JSON is the complete record; later formats such as GitHub annotations and SARIF render this record.

## `explain`

Print rule documentation as text: what it checks, why it matters, an example message, how to fix it, and known limitations. It works offline and exits 0 on success.

Use the same config discovery and `--config` behavior as `lint`. Load and validate the config and its explicitly listed plugins, but do not expand input paths, require generated files or FSH sources, or execute checks. Invalid configuration still fails with exit 2.

```sh
sdc-lint explain smart-forms/repeating-group-variable --config ig/sdc-questionnaire-lint.config.mjs
```

With no rule ID, list all registered rules, including rules configured `off`, plugin rules from the selected config, and `lint/stale-suppression`. Sort by rule ID and show the one-line description, default severity, effective severity (or `off`), and enabled status. A named rule can be explained even when it is configured `off`. Rules from plugins not loaded by the selected config are not registered.

An unknown rule ID exits 2. Suggest a similar registered ID when one exists; for an unknown external namespace, explain that its plugin must be listed in the selected `.mjs` config.

```text
error: unknown rule sdc/undefined-varible
help: a rule with a similar name exists: sdc/undefined-variable
```

## Stale suppressions

A stale suppression is reported as `lint/stale-suppression` with severity `warning`, at the suppression's config location. The `lint` namespace is reserved for findings about the linter's configuration; plugins may not use it.

Assess matches against findings before suppression. A suppression is applied when it matches at least one finding. Report it as stale only when the run establishes that it is unnecessary:

- In a targeted run, assess suppressions whose input files are selected. Suppressions for other files are **not assessed**, even if those files no longer exist.
- In a full run, also check whether files named by suppressions outside the selection still exist. A confirmed missing target file makes its suppression stale. An existing file outside the configured selection remains not assessed; an inability to determine whether it exists is an input failure, not proof of staleness.
- Within a selected file, a removed resource or expression site can establish staleness. If the site exists, the suppressed rule must have completed the applicable check before an absence of findings establishes staleness. A rule configured `off` or an unavailable analysis leaves the suppression not assessed.

For example, `lint A.json` does not report a suppression for `B.json` as stale. A full run can report that suppression when B has been deleted, provided the run otherwise completes. Input or execution failures still produce a failed report, including when no Questionnaires remain.

The summary counts applied, stale and not-assessed suppression entries separately. These states do not turn a rule off and do not create findings for unassessed targets. Missing reasons, unknown rule IDs and selectors that ambiguously match several sites remain config failures.

## Author and automation recipes

The IG's `npm run lint` script runs `sushi . && sdc-lint lint`. Fix mapped findings in FSH and regenerate before checking again. Unmapped compiled locations help locate the expression; edits to generated files will be overwritten by SUSHI.

For a machine report, run the locally installed commands with build logs on stderr. This POSIX shell recipe assumes the IG has installed its pinned development dependencies and is the current directory:

```sh
#!/bin/sh
set -eu

if ./node_modules/.bin/sushi . >&2; then
  :
else
  build_status=$?
  exit "$build_status"
fi

if ./node_modules/.bin/sdc-lint lint --format json > lint-report.json; then
  lint_status=0
else
  lint_status=$?
fi

# Retain or upload lint-report.json here, including when lint_status is 1 or 2.
exit "$lint_status"
```

Consume the report only after this invocation reaches the linter; a build failure does not produce a new report. The file redirect truncates the previous report when the linter starts. Package-manager banners and SUSHI logs must not be redirected into the JSON report. Automation should retain the report on exit 1 as well as exit 0, and distinguish exit 2 from findings that need fixes.

## Deferred

Not in the first version: `--strict-suppressions`, `--verbose`, `--preset`, `--fsh-dir`, the `concise`, JSON Lines, `github` and SARIF formats, file sinks (`--json <path>`, `--sarif <path>`), stdin input, `init` and `rules` commands, an MCP server, and `--format json` for `explain`.
