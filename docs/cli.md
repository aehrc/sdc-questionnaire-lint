# CLI

The command-line contract for the first version. It supersedes plan §7.3 and the output-mode list in [linter-design-guidelines.md](linter-design-guidelines.md) §4. Configuration, suppression and reporting amendments are recorded in [plan-amendments.md](plan-amendments.md). Terms are defined in [GLOSSARY.md](../GLOSSARY.md).

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

Absolute input and config paths are accepted. Report paths use `/` separators. Config `files` is a non-empty array of file, directory or glob strings; an empty array is a config failure. `source.fsh` is an array of directories, defaulting to `["input/fsh"]`; `[]` explicitly omits FSH source lookup. `hostVariables` is a non-empty array of unique, non-empty names written without `%`: the names the application running the form supplies, available to every expression (core-rules.md D1). An empty array, a repeated name or a name that starts with `%` is a config failure. The SUSHI index defaults to `fsh-generated/data/fsh-index.json` beneath the same base as the implicit inputs.

`compat` selects the runtime versions a compatibility plugin checks forms against, by plugin namespace: `"latest"`, or exact versions by component. For the Smart Forms plugin, `"latest"` (the default when `compat` has no `smart-forms` entry) selects the newest versions the installed plugin has verified, not the newest on npm. An explicit object names `renderer` and `populate`, and names `template-extract` only when template extraction is checked:

```js
compat: { 'smart-forms': { renderer: '1.4.0', populate: '4.7.1' } }
```

Each of these fails `lint` and `explain` with `CONFIG_INVALID` before any input is read: a namespace whose plugin is not listed in `plugins`, a plugin that declares no compatibility target, an unknown component, a missing required component, a version the plugin has not verified (the help lists the verified ones; there is no fallback to a nearby version), and `"latest"` for a single component. The selected versions appear in the report's `run.compat`.

For example, when invoked from the parent of `ig`, `lint --config ig/sdc-questionnaire-lint.config.json` uses defaults beneath `ig`. An additional CLI path is still relative to the caller's working directory.

## `lint`

### Flags

| Flag | Default | Meaning |
| :- | :- | :- |
| `--format text\|json\|github\|sarif` | `text` | Output format on stdout |
| `--show-info` | false | Include info findings in text output |

`--show-info` affects presentation only. It does not change analysis, counts, suppressions or exit status. JSON, GitHub and SARIF output always include all severities; the flag has no effect with those formats.

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

In text mode, stdout stays empty on failure. Once a valid `lint --format json`, `github` or `sarif` selection is recognized, handled failures also write that format's failure output to stdout, including subsequent argument-validation failures: the failed report for `json`, one error annotation for `github`, and a SARIF log with no results for `sarif`. Unknown commands or an invalid/ambiguous format selection use stderr only. Process termination and failures before the CLI can start cannot guarantee a failure document.

Buffer the report until analysis completes; a handled failure discards partial findings and does not emit a success-shaped summary. Config and plugin logging must not contaminate report stdout. A rule crash identifies its rule ID in both the failure record and stderr.

Findings are sorted identically in every format: by displayed file, then known line and column (unknown positions last), then rule ID, then resource pointer and site/config pointer. Ties use the fingerprint. String comparisons are locale-independent. Counts are computed before text visibility filtering.

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
Linter: 0.1.0. Plugins: sdc@0.1.0, smart-forms@0.1.0. SUSHI: 3.20.1.
Smart Forms: renderer 1.4.0, populate 4.7.1, template-extract 1.0.15.
```

Versions in examples are illustrative. `SUSHI` names the IG's installed SUSHI, the report's `run.sushi`, and is left out when none is found. The Smart Forms line is present only when that plugin runs; it always names the resolved component versions, including when config uses `latest`.

- The first line of each finding has a stable format: `file[:line:col]: severity rule-id message`.
- An unmapped finding names the compiled file without invented coordinates and adds a `location` line containing the resource identity and a file-relative JSON Pointer. For a Bundle or contained resource, include its resource pointer as well. If the resource has no ID, its resource type and pointer identify it. Show the expression excerpt when one is available, and the reason FSH mapping failed. Item text and linkId remain useful context, but are not the only locator.
- A configuration finding names the config file and its entry pointer, such as `/suppress/0`; it does not invent a Questionnaire location. For `.mjs`, this pointer addresses the exported config object.
- Each related location, such as the other declaration of a duplicated name, follows on a `related:` line: its FSH `file:line:col` when mapped, otherwise its JSON Pointer in the finding's file, then its message when it has one. For example, `  related: /extension/0: %patient is also declared here`.
- Errors and warnings are shown by default; `--show-info` also shows info. The summary always counts all unsuppressed findings. An info-only run says, for example, `4 findings (0 errors, 0 warnings, 4 info) in 3 questionnaires. 4 info findings hidden; use --show-info.`
- A run with no unsuppressed findings prints `0 findings in 3 questionnaires.` followed by the same coverage and configuration summary. Suppressed findings and unchecked expressions are still counted separately.

### `json`

One versioned document on stdout. [report-format.md](report-format.md) defines its fields, locations, counts and compatibility rules. The normative [JSON Schema](schemas/lint-report.schema.json) and [complete examples](examples/reports/README.md) cover completed, failed, mapped, unmapped and stale-suppression reports.

A completed report has `status: "completed"`, all unsuppressed findings, run metadata and a summary. This includes runs that exit 1. Metadata records the linter and loaded plugin versions, resolved compatibility versions, and the version of the IG's installed SUSHI when one is found. The summary records files read/skipped, Questionnaires, expressions analysed/unchecked, severity counts, suppressed findings, suppression assessment, config and available FSH directories.

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

Failure codes identify the cause without parsing `message`. A failed report has no `findings`, `run` or `summary` fields, so it cannot be mistaken for a completed clean run. JSON is the complete record; the `github` and `sarif` formats render this record.

### `github`

For a GitHub Actions step. stdout holds one workflow-command annotation per finding, in report order, then every finding as text in a collapsed group, then the text summary. For the two findings of the text example, with the `::stop-commands::` token shown as `<token>`:

```text
::warning title=sdc/unused-declaration::fsh-generated/resources/Questionnaire-Example.json: "Patient summary" (patient-summary) declares %25age, which nothing uses.%0Alocation: compiled JSON; Questionnaire/Example; /item/1/extension/0/valueExpression/expression%0Anote: FSH line not found, the expression appears more than once%0Ahelp: remove the variable, or reference it as %25age
::error file=input/fsh/Example.fsh,line=42,endLine=42,col=18,endColumn=29,title=sdc/undefined-variable::"Patient name" (patient-name) uses %25patientNmae, which is not defined. This field will not calculate.%0Ahelp: a variable with a similar name exists: %25patientName
::group::sdc-lint findings
::stop-commands::<token>
fsh-generated/resources/Questionnaire-Example.json: warning sdc/unused-declaration "Patient summary" (patient-summary) declares %age, which nothing uses.
  %patient.birthDate
  location: compiled JSON; Questionnaire/Example; /item/1/extension/0/valueExpression/expression
  note: FSH line not found, the expression appears more than once
  help: remove the variable, or reference it as %age

input/fsh/Example.fsh:42:18: error sdc/undefined-variable "Patient name" (patient-name) uses %patientNmae, which is not defined. This field will not calculate.
  %patientNmae.exists()
  ^~~~~~~~~~~~
  help: a variable with a similar name exists: %patientName
::<token>::
::endgroup::
::stop-commands::<token>
2 findings (1 error, 1 warning, 0 info) in 1 questionnaire.
Inputs: full run; 1 file read, 0 skipped. Expressions: 1 analysed, 0 unchecked. Suppressed findings: 0.
Suppressions: 0 applied, 0 stale, 0 not assessed.
Config: none, built-in defaults. FSH sources: input/fsh.
Linter: 0.1.0. Plugins: sdc@0.1.0.
::<token>::
```

- `error`, `warning` and `info` become `::error`, `::warning` and `::notice`, titled with the rule ID. The message is followed by the same `location:`, `note:`, `related:` and `help:` lines as text output, escaped as workflow commands require.
- A mapped finding is annotated at its FSH file and lines. Columns are given only for a range on one line, and `endColumn` is inclusive, as GitHub reads it.
- An unmapped or configuration finding keeps its severity, so an unmapped error is still an error annotation, but has no position: GitHub has no place for a compiled JSON site or a config entry. Its message starts with the file, and its `location:` line names the resource and pointer.
- GitHub shows only the first few annotations of each kind in a step, so the log always holds every finding, info included. The log and the summary are written under `::stop-commands::`, with the SHA-256 of the text they wrap as the token, so text from a form cannot run a workflow command.
- When `GITHUB_STEP_SUMMARY` is set, as it is in every Actions step, the job summary also gets a Markdown section: the counts, a table of every finding (Severity, Rule, Location, Message) and the other summary lines, including the linter, plugin and SUSHI versions. Text from the forms is escaped so it cannot add Markdown or HTML. Rows stop below GitHub's 1 MiB limit, followed by a line saying how many more findings are in the job log. A summary that cannot be written is a `warning:` on stderr and does not change the exit status.

On failure, stdout holds one error annotation titled with the failure code, at the failure's file when it names one:

```text
::error file=missing.json,title=sdc-lint failed%3A INPUT_NOT_FOUND::Input file does not exist.%0Ahelp: Check the supplied path.
```

and the job summary gets a section with no counts or table, so it cannot be read as a clean run:

```markdown
### sdc-lint did not complete

- Code: INPUT\_NOT\_FOUND
- File: missing.json
- Problem: Input file does not exist.
- Help: Check the supplied path.
```

### `sarif`

One [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/sarif-v2.1.0-errata01-os-complete.html) log on stdout with one run, for GitHub code scanning or another SARIF viewer. It renders the same record as `json`.

- `tool.driver` names `sdc-questionnaire-lint` and its version, and describes each rule that ran, and any rule a finding names: its description, the "what it checks" and "how to fix" of its documentation, its `helpUri` and its default level. `tool.extensions` lists the plugins with their versions. The run's `properties` hold the report's `selection`, `compat`, `summary` and, when the report has it, `sushi`.
- Each finding is a result, in report order, at the level `error`, `warning` or `note` (for info). Its message is the finding's message followed by the same detail lines as text output.
- Artifact URIs are relative to `%SRCROOT%`, which `originalUriBaseIds` defines as the working directory; report paths are relative to it too. Run the linter from the repository root, so code scanning finds the files.
- A mapped finding has its FSH region. SARIF counts lines and columns as the report does, from 1 and in UTF-16 code units (`columnKind: "utf16CodeUnits"`) with an exclusive end column, so the numbers are the report's own.
- An unmapped finding keeps its compiled JSON file, with no region; its `properties` hold `jsonLocation`, and `sourceMapping` with the reason it is unmapped. A configuration finding has the config file, and `properties.configLocation`.
- `partialFingerprints` holds the report's `fingerprint`, as `primaryLocationLineHash` and as `sdcQuestionnaireLint/v1`. It has no line numbers, so code scanning keeps an alert when its FSH line moves. It is unique within the run, so two findings of one rule in one expression are two alerts.

The result for the error in the text example:

```json
{
  "ruleId": "sdc/undefined-variable",
  "ruleIndex": 0,
  "level": "error",
  "message": {
    "text": "\"Patient name\" (patient-name) uses %patientNmae, which is not defined. This field will not calculate.\nhelp: a variable with a similar name exists: %patientName"
  },
  "locations": [
    {
      "physicalLocation": {
        "artifactLocation": {
          "uri": "input/fsh/Example.fsh",
          "uriBaseId": "%SRCROOT%"
        },
        "region": {
          "startLine": 42,
          "startColumn": 18,
          "endLine": 42,
          "endColumn": 30
        }
      }
    }
  ],
  "partialFingerprints": {
    "primaryLocationLineHash": "example:undefined-variable:Example:patient-name:calculatedExpression:patientNmae",
    "sdcQuestionnaireLint/v1": "example:undefined-variable:Example:patient-name:calculatedExpression:patientNmae"
  },
  "properties": {
    "jsonLocation": {
      "file": "fsh-generated/resources/Questionnaire-Example.json",
      "pointer": "/item/0/extension/0/valueExpression/expression",
      "resource": {
        "resourceType": "Questionnaire",
        "id": "Example",
        "pointer": ""
      }
    },
    "sourceMapping": {
      "status": "mapped",
      "confidence": "exact"
    },
    "expression": {
      "text": "%patientNmae.exists()",
      "range": {
        "startOffset": 0,
        "endOffset": 12
      }
    }
  }
}
```

A completed run always has `results`, `[]` when nothing was found. A failed run has no `results` at all: SARIF reads an absent `results` as "the tool produced no results", while `[]` would tell code scanning that every open alert is fixed. Its invocation reports the failure code and help:

```json
[
  {
    "executionSuccessful": false,
    "toolExecutionNotifications": [
      {
        "level": "error",
        "descriptor": {
          "id": "INPUT_NOT_FOUND"
        },
        "message": {
          "text": "Input file does not exist.\nhelp: Check the supplied path."
        },
        "locations": [
          {
            "physicalLocation": {
              "artifactLocation": {
                "uri": "missing.json",
                "uriBaseId": "%SRCROOT%"
              }
            }
          }
        ],
        "properties": {
          "help": "Check the supplied path."
        }
      }
    ]
  }
]
```

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
- A suppression whose `extensionUrl` is launchContext or extractAllocateId targets a declared name on an element rather than an expression site: the item its `linkId` or its item `pointer` selects, or the root without either. It hides the rule's findings at every declaration of that name on that element. It is stale when the name is no longer declared there, or when its rule completed its check there with no finding; a rule that does not check declarations leaves it not assessed. Selectors that match declarations of several names, or on several elements, are a config failure.

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

The report records the version of the IG's installed `fsh-sushi` as `run.sushi`, which no flag needs to pass ([report-format.md](report-format.md#run-metadata-and-summary)). Install SUSHI as a development dependency and run that copy, as this recipe and `npm run` scripts do, so the recorded version is the one that generated the inputs. A SUSHI installed only globally is not recorded.

In GitHub Actions, the `github` format annotates the pull request and writes the job summary, and a SARIF upload adds the findings to code scanning. The upload is optional and needs `security-events: write`, so it runs in a job of its own: the lint job only reads the repository, and passes the SARIF log on as an artifact. Upload the SARIF only when the linter exits 0 or 1: exit 2 means the run did not complete, so no log is kept, rather than relying on how code scanning reads a failed run. Without code scanning, leave out the `Lint as SARIF` and `Keep the SARIF` steps and the `upload-sarif` job. During the report-only stage, leave out the `Fail on lint errors` step; once errors become a required check, keep it.

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    outputs:
      sarif: ${{ steps.sarif.outcome }}
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: ./node_modules/.bin/sushi .
      - name: Lint
        id: lint
        run: |
          status=0
          ./node_modules/.bin/sdc-lint lint --format github || status=$?
          echo "status=$status" >> "$GITHUB_OUTPUT"
      - name: Lint as SARIF
        id: sarif
        if: steps.lint.outputs.status != '2'
        # Exit 1 is a completed run with errors; only exit 2 fails this step.
        run: ./node_modules/.bin/sdc-lint lint --format sarif > lint.sarif || [ $? -eq 1 ]
      - name: Keep the SARIF
        if: steps.sarif.outcome == 'success'
        uses: actions/upload-artifact@v7
        with:
          name: lint-sarif
          path: lint.sarif
      - name: Fail on lint errors
        if: steps.lint.outputs.status != '0'
        run: exit ${{ steps.lint.outputs.status }}

  upload-sarif:
    needs: lint
    # !cancelled() lets it run after the lint job failed on errors, when a log was kept.
    if: ${{ !cancelled() && needs.lint.outputs.sarif == 'success' }}
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v7
      - uses: actions/download-artifact@v8
        with:
          name: lint-sarif
      - uses: github/codeql-action/upload-sarif@v4
        with:
          sarif_file: lint.sarif
```

## Deferred

Not in the first version: `--strict-suppressions`, `--verbose`, `--preset`, `--fsh-dir`, the `concise` and JSON Lines formats, file sinks (`--json <path>`, `--sarif <path>`; one run writes one format to stdout), stdin input, `init` and `rules` commands, an MCP server, and `--format json` for `explain`.
