# Reports

`sdc-lint lint` writes its report to stdout in one of four formats, chosen with `--format`. Every format holds the same findings, in the same order, with the same counts, and the exit code does not depend on the format. One run writes one format; to get two, run the linter twice.

| Format | For | Holds |
| :- | :- | :- |
| `text` | People at a terminal, and editor problem matchers. The default | Each finding with its excerpt and help, then a summary |
| `json` | Scripts, dashboards and AI agents | The complete record: every field of every finding, the run and the summary |
| `github` | A GitHub Actions step | Annotations on the pull request, the findings in the job log, and a job summary |
| `sarif` | GitHub code scanning and other SARIF viewers | A SARIF 2.1.0 log with a result for each finding and a description of each rule |

```sh
npx sdc-lint lint                    # text
npx sdc-lint lint --format json > lint-report.json
npx sdc-lint lint --format github
npx sdc-lint lint --format sarif > lint.sarif
```

The linter writes only the report to stdout, so a redirect captures nothing else. Keep other tools' logs, such as SUSHI's, out of the file: compile in a separate command or send its output to stderr.

## Where a finding points

Every format locates a finding the same way:

- **Mapped**: the FSH file, line and column of the expression, or of the part of it with the problem. This is the usual case in an IG.
- **Unmapped**: the compiled JSON file, the resource, and the expression's JSON Pointer, with the reason no FSH line was found: no FSH sources were available, the expression was not found in them, it appears more than once, or it spans several lines.
- **Config**: a finding about the config itself, such as a [stale suppression](suppression.md#stale-suppressions), points at the config file and the entry's pointer, such as `/suppress/0`.

The JSON and SARIF formats keep the compiled JSON location even for a mapped finding.

## `text`

The default, for reading. Each finding is a block:

```text
input/fsh/invalid-demo.fsh:20:46: error sdc/duplicate-declaration The name %dup is declared more than once on the Questionnaire root, so it is unclear which value expressions that use it get.
  2
  related: /extension/2/valueExpression/expression: %dup is also declared here
  help: rename or remove one of the declarations of %dup

input/fsh/invalid-demo.fsh:41:54: error sdc/parse-error The expression ends before it is complete.
  1 +
     ^
  note: the FHIRPath parser reported: mismatched input '<EOF>'
```

- The first line is always `file[:line:col]: severity rule-id message`. Editors and CI tools can match it; see [VS Code](use-cases/vscode.md).
- The expression follows, with a caret under the problem when the linter knows where it is.
- `related:` names another place involved, such as the other declaration of a duplicated name.
- `location:` and `note:` appear for an unmapped finding: the resource and JSON Pointer, and why no FSH line was found. `note:` can also add detail, such as the FHIRPath parser's own message.
- `help:` says how to fix it.

The summary closes every run, including a run with no findings:

```text
15 findings (8 errors, 4 warnings, 3 info) in 1 questionnaire. 3 info findings hidden; use --show-info.
Inputs: full run; 1 file read, 0 skipped. Expressions: 17 analysed, 4 unchecked. Suppressed findings: 0.
Suppressions: 0 applied, 0 stale, 0 not assessed.
Config: none, built-in defaults. FSH sources: input/fsh.
Linter: 0.1.0. Plugins: sdc@0.1.0. SUSHI: 3.20.1.
```

| Line | Says |
| :- | :- |
| Counts | Findings by severity, counted after suppression. `info` findings are hidden unless you pass `--show-info`, but always counted |
| `Inputs:` | A full or targeted run; files read, and JSON files skipped because they hold no Questionnaire. Expressions analysed, and unchecked: ones a check could not run on, such as an expression that only references a Library. Findings hidden by suppressions |
| `Suppressions:` | How many entries were applied, stale or not assessed |
| `Config:` | The config used, and the FSH directories found |
| `Linter:` | The linter, plugin and SUSHI versions, then a `Compat` line for each compatibility plugin, naming the versions it checked against |

Text is coloured only when stdout is a terminal, and never when `NO_COLOR` is set.

## `json`

One JSON document: the complete record, which the other formats render. Use it for anything that reads findings with code. A report, shortened to one finding:

```json
{
  "schemaVersion": 1,
  "status": "completed",
  "run": {
    "tool": { "name": "sdc-questionnaire-lint", "version": "0.1.0" },
    "plugins": [{ "name": "sdc", "version": "0.1.0" }],
    "compat": {},
    "selection": "full",
    "sushi": { "version": "3.20.1" }
  },
  "findings": [
    {
      "kind": "questionnaire",
      "ruleId": "sdc/undefined-variable",
      "severity": "error",
      "message": "%missing is not available on item undefined-variable.",
      "help": "declare it on this item, an ancestor item or the root, or list it in hostVariables if the application running the form supplies it",
      "jsonLocation": {
        "file": "fsh-generated/resources/Questionnaire-invalid-demo.json",
        "pointer": "/item/2/extension/0/valueExpression/expression",
        "resource": { "resourceType": "Questionnaire", "id": "invalid-demo", "pointer": "" },
        "linkId": "undefined-variable"
      },
      "sourceLocation": {
        "status": "mapped",
        "confidence": "exact",
        "location": { "file": "input/fsh/invalid-demo.fsh", "line": 55, "column": 51, "endLine": 55, "endColumn": 59 }
      },
      "expression": { "text": "%missing", "range": { "startOffset": 0, "endOffset": 8 } },
      "fingerprint": "462b3183e13b860354b9f2c56447873f5f19e8d82a079270da31c1d213926ef7"
    }
  ],
  "summary": {
    "files": { "read": 1, "skipped": 0 },
    "questionnaires": 1,
    "expressions": { "analysed": 17, "unchecked": 4 },
    "errors": 1,
    "warnings": 0,
    "info": 0,
    "suppressedFindings": 0,
    "suppressions": { "applied": 0, "stale": 0, "notAssessed": 0 },
    "config": null,
    "fshSources": ["input/fsh"],
    "fshSourceLookup": "enabled"
  }
}
```

- `run` records what ran: the linter and plugin versions, the runtime versions each compatibility plugin checked (`compat`), whether the run was full or targeted, and the IG's installed SUSHI.
- Each finding has its rule, severity, message and help, its compiled JSON location, its FSH location or the reason there is none, and the expression with the range of the problem. Optional fields, such as `help`, `note`, `relatedLocations` and `suggestions`, are left out when they do not apply.
- `summary` holds the counts the text summary prints.
- `info` findings are always included; `--show-info` affects text output only.

A run that does not complete, exit code 2, still writes a report, with `status: "failed"` and a failure code instead of findings, so it cannot be mistaken for a clean run:

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

Check `status` before reading `findings`, and branch on `failure.code` rather than the message. [JSON report format](report-format.md) defines every field, with its [JSON Schema](schemas/lint-report.schema.json) and [complete example reports](examples/reports/README.md).

## `github`

For a GitHub Actions step. It writes three things:

- **Annotations**: one per finding, titled with its rule ID. `error` and `warning` become error and warning annotations, `info` becomes a notice. A mapped finding is annotated on its FSH lines, so it shows in the pull request's diff; an unmapped or config finding is annotated without a position.
- **The job log**: every finding as text, in a collapsed `sdc-lint findings` group, then the summary. GitHub shows only the first few annotations of each kind in a step, so the log is the complete list.
- **The job summary**: the counts, a table of every finding with its severity, rule, location and message, and the summary lines.

```text
::error file=input/fsh/invalid-demo.fsh,line=20,endLine=20,col=46,endColumn=46,title=sdc/duplicate-declaration::The name %25dup is declared more than once on the Questionnaire root, so it is unclear which value expressions that use it get.%0Arelated: /extension/2/valueExpression/expression: %25dup is also declared here%0Ahelp: rename or remove one of the declarations of %25dup
::group::sdc-lint findings
…
::endgroup::
```

Outside GitHub Actions, the annotations and log still go to stdout, but no job summary is written, because `GITHUB_STEP_SUMMARY` is not set. A run that does not complete writes one error annotation titled with the failure code, and a job summary headed "sdc-lint did not complete". [CI integration](use-cases/ci.md) has workflows.

## `sarif`

A [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/sarif-v2.1.0-errata01-os-complete.html) log, for GitHub code scanning or any SARIF viewer, such as the SARIF Viewer extension for VS Code.

```json
{
  "ruleId": "sdc/undefined-variable",
  "level": "error",
  "message": {
    "text": "%missing is not available on item undefined-variable.\nhelp: declare it on this item, an ancestor item or the root, or list it in hostVariables if the application running the form supplies it"
  },
  "locations": [
    {
      "physicalLocation": {
        "artifactLocation": { "uri": "input/fsh/invalid-demo.fsh", "uriBaseId": "%SRCROOT%" },
        "region": { "startLine": 55, "startColumn": 51, "endLine": 55, "endColumn": 59 }
      }
    }
  ],
  "partialFingerprints": {
    "primaryLocationLineHash": "462b3183e13b860354b9f2c56447873f5f19e8d82a079270da31c1d213926ef7",
    "sdcQuestionnaireLint/v1": "462b3183e13b860354b9f2c56447873f5f19e8d82a079270da31c1d213926ef7"
  }
}
```

- The log describes each rule that ran: its description, what it checks and how to fix it, so a viewer can show the rule's documentation beside an alert.
- `error`, `warning` and `info` become the levels `error`, `warning` and `note`. The message carries the same `help:` and other lines as text output.
- A mapped finding has its FSH region. An unmapped finding has its compiled JSON file with no region, and its JSON location in `properties`.
- File paths are relative to `%SRCROOT%`, the directory the linter ran in. Run it from the repository root, so code scanning finds the files.
- The fingerprint has no line numbers, so code scanning keeps tracking an alert when its FSH line moves, and closes it when the finding is fixed.

A run that does not complete writes a log with no results. Do not upload that log: it would look like a clean run. [CI integration](use-cases/ci.md#code-scanning-with-sarif) uploads only after exit code 0 or 1.

## Fingerprints

Every finding has a fingerprint, in the JSON report and in SARIF's `partialFingerprints`. It is built from the rule, the file, the resource, the expression's item linkId, extension and name, and the text the finding points at, never from line numbers or array positions. So it stays the same when you edit other parts of the FSH or reorder items, and a tool can tell a new finding from one it has already seen.

The CLI contract defines every format in full, starting at [`text`](cli.md#text).
