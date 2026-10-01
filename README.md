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
- [Design guidelines](docs/linter-design-guidelines.md) and [glossary](CONTEXT.md) — design principles and terminology.
