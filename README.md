# sdc-questionnaire-lint

A CLI and TypeScript library for statically checking FHIRPath and x-fhir-query expressions in FHIR SDC Questionnaires, for form authors, CI pipelines and AI agents.

The npm package is `sdc-questionnaire-lint`; the CLI command is `sdc-lint`.

Planned workflow in an implementation guide (IG):

```sh
sushi . && sdc-lint lint
sdc-lint explain sdc/undefined-variable
```

The linter reads compiled Questionnaire JSON or Bundles, defaulting to `fsh-generated/resources`. Regenerate with SUSHI after editing FSH. Use `--format json` for structured reports and `--show-info` to reveal info findings in text output.

Start with these docs:

- [Core plan](docs/core-plan.md) and [amendments](docs/plan-amendments.md) — scope and decisions; amendments take precedence.
- [CLI contract](docs/cli.md) — commands, configuration, exit codes and automation recipes.
- [Report format](docs/report-format.md), [JSON Schema](docs/schemas/lint-report.schema.json) and [examples](docs/examples/reports/README.md) — machine integration.

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
