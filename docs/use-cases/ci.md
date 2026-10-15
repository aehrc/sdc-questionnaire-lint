# CI integration

Lint every push and pull request, so a broken expression is caught in review rather than when the form is filled in. The linter needs nothing CI-specific: it writes to stdout, picks the output with `--format`, and reports the outcome in its exit code.

## Exit codes

| Exit code | Meaning | What CI should do |
| :- | :- | :- |
| 0 | No errors; warnings and info may remain | Pass |
| 1 | One or more errors | Fail the check; the findings say what to fix |
| 2 | The run did not complete: bad config, unreadable input, no Questionnaires found | Fail; fix the setup, not the forms |

Suppressed findings never count. Only `error` findings fail a run; to make a rule block merges, set it to `error` in [`rules`](../configuration.md#rules).

## Output formats

| Format | Use it for |
| :- | :- |
| `text` | Any CI log. The default |
| `github` | GitHub Actions: annotations on the pull request, and a job summary |
| `sarif` | GitHub code scanning, or any other SARIF viewer |
| `json` | Your own scripts and dashboards; see [JSON report format](../report-format.md) |

Output does not change in CI: the linter detects no CI variables, and prints colour only to a terminal.

## GitHub Actions

The smallest workflow compiles the IG, lints it with the `github` format, and fails on errors:

```yaml
name: Lint
on: [push, pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: ./node_modules/.bin/sushi .
      - run: ./node_modules/.bin/sdc-lint lint --format github
```

With `--format github`:

- each finding becomes an annotation, titled with its rule ID, on the FSH line in the pull request's changed files. A finding with no FSH line, or one about the config, is annotated without a position;
- the job summary gets a table of every finding, with the counts and the linter, plugin and SUSHI versions;
- the job log holds every finding in a collapsed group, because GitHub shows only the first few annotations of each kind.

Run the linter from the repository root, where the IG is, so the file paths in annotations match the repository. If the IG is in a subdirectory, set `working-directory` on the steps.

### Report first, then block

When you add the linter to an existing IG, start by reporting without failing, and fix or suppress the findings; then make errors fail the check. To report only, let the lint step pass whatever it finds, but still fail when the run did not complete:

```yaml
      - run: ./node_modules/.bin/sdc-lint lint --format github || [ $? -eq 1 ]
```

Remove `|| [ $? -eq 1 ]` once the IG is clean, and make the job a required check.

### Code scanning with SARIF

To keep findings as code scanning alerts, which track each finding across commits and close when it is fixed, also write a SARIF log and upload it. Uploading needs `security-events: write`, so it runs in its own job and the lint job keeps read-only access:

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

The SARIF log is uploaded only when the linter exits 0 or 1. Exit 2 means the run did not complete, and its log has no results, which code scanning could take for a clean run. Each alert's fingerprint has no line numbers, so an alert survives its FSH line moving.

## Other CI systems

Any CI that runs Node 22 can run the linter: install the project's dependencies, compile with SUSHI, lint, and let the exit code pass or fail the job. To keep the findings, write the JSON report to a file and save it as a build artifact, including when the linter exits 1:

```sh
#!/bin/sh
set -eu

./node_modules/.bin/sushi . >&2

status=0
./node_modules/.bin/sdc-lint lint --format json > lint-report.json || status=$?

# Save lint-report.json as an artifact here.
exit "$status"
```

Send SUSHI's log to stderr, as above, so it never ends up inside the report. If your CI reads SARIF, use `--format sarif` the same way.

## Pin the versions

Install `sdc-questionnaire-lint`, any plugins and `fsh-sushi` as development dependencies with exact versions, and install them in CI with `npm ci`. CI then runs the versions you tested with locally, and the report records them: the linter and plugin versions in `run`, the Smart Forms versions checked in `run.compat`, and the SUSHI version in `run.sushi`.

[Author and automation recipes](../cli.md#author-and-automation-recipes) in the CLI contract has the full rules for automation.
