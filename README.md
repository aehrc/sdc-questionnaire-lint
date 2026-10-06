# sdc-questionnaire-lint

A CLI and TypeScript library for statically checking FHIRPath and x-fhir-query expressions in FHIR SDC Questionnaires, for form authors, CI pipelines and AI agents.

The npm package is `sdc-questionnaire-lint`; the CLI command is `sdc-lint`.

## Usage

In an implementation guide (IG), after building it with SUSHI:

```sh
sushi . && sdc-lint lint
```

With no paths, `lint` checks the compiled JSON in `fsh-generated/resources`. The linter reads compiled Questionnaires and Bundles, so run SUSHI again after editing FSH.

```sh
sdc-lint lint fsh-generated/resources/Questionnaire-intake.json   # one file: a targeted run
sdc-lint lint "fsh-generated/resources/Questionnaire-*.json"       # quote globs
sdc-lint lint --format json > report.json                          # one JSON report on stdout
sdc-lint lint --show-info                                          # also show info findings
```

| Exit code | Meaning |
| :- | :- |
| 0 | Analysis completed with no unsuppressed errors; warnings and info may remain |
| 1 | Analysis completed with one or more unsuppressed errors |
| 2 | The run did not complete: bad config, unreadable input, no Questionnaires found, a rule crash, or wrong usage |

Findings and the summary go to stdout; failures go to stderr as `error:` and `help:` lines. With `--format json`, a failure also writes a `status: "failed"` document to stdout. The [CLI contract](docs/cli.md) has the full rules and automation recipes.

**Status:** the CLI, input selection, reporters, configuration and `explain` work. Expression discovery works, with two built-in rules: `sdc/parse-error` and `sdc/uncatalogued-expression`. Not built yet: plugins, suppressions, the scope model and the rules that depend on it, x-fhir-query checks and FSH source mapping. Until then every finding keeps its compiled JSON location.

[examples/health-check](examples/health-check/README.md) is a form with common mistakes and the output the linter gives for it.

Start with these docs:

- [Core plan](docs/core-plan.md) and [amendments](docs/plan-amendments.md) — scope and decisions; amendments take precedence.
- [CLI contract](docs/cli.md) — commands, configuration, exit codes and automation recipes.
- [Report format](docs/report-format.md), [JSON Schema](docs/schemas/lint-report.schema.json) and [examples](docs/examples/reports/README.md) — machine integration.

## Configuration

`lint` and `explain` use `sdc-questionnaire-lint.config.json` from the current directory when it exists; parent directories are not searched. `--config <path>` names another config instead. Without a config, the built-in rules run at their default severities.

```json
{
  "files": ["fsh-generated/resources"],
  "source": { "fsh": ["input/fsh"] },
  "rules": { "sdc/uncatalogued-expression": "off", "sdc/parse-error": "warning" }
}
```

- `files`: the inputs `lint` checks when no paths are given: files, directories or globs. Defaults to `fsh-generated/resources`.
- `source.fsh`: the FSH directories, defaulting to `["input/fsh"]`; `[]` omits FSH source lookup.
- `rules`: a rule ID set to `error`, `warning`, `info` or `off`. A rule that is `off` does not run.

Paths in the config are relative to the config's directory, not the current one. From the parent of an IG, `sdc-lint lint --config ig/sdc-questionnaire-lint.config.json` checks `ig/fsh-generated/resources`.

```sh
sdc-lint explain                    # every rule, with its default and effective severity
sdc-lint explain sdc/parse-error    # what the rule checks, why, an example message and the fix
```

## Development

Requires Node 22.12 or later and npm 11.21.0, the version in `packageManager`. The npm bundled with Node 22 is older and must be upgraded:

```sh
nvm install && nvm use
npm install --global npm@11.21.0
```

Older npm drops native binaries from the lockfile when a package is added, and Vitest then fails to start with `Cannot find native binding`.

```sh
npm ci
npm run check
```

`npm run check` type-checks, lints, checks formatting, builds, tests and validates both packages. CI runs it on Node 22 and 24; run it before every commit.
