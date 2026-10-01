# sdc-questionnaire-lint

A CLI and library that statically checks the expressions (FHIRPath, x-fhir-query) inside FHIR SDC Questionnaires, with a plugin for Smart Forms compatibility rules.

Stack: TypeScript, Node 22+, tsup, Vitest; fhirpath.js pinned to 4.10.1.

## Docs

- [CONTEXT.md](CONTEXT.md) is the glossary. Use its terms in code, messages and docs.
- [docs/core-plan.md](docs/core-plan.md) is the spec. Read the relevant section before working on scope, a rule, the plugin contract, configuration, suppressions, source mapping, the CLI or the IG integration.
- [docs/plan-amendments.md](docs/plan-amendments.md) lists decisions that override the plan. Read it every time you read the plan.
- [docs/cli.md](docs/cli.md) is the CLI contract: commands, flags, defaults, output formats and exit codes. Read it before working on the CLI or a reporter.
- [docs/linter-design-guidelines.md](docs/linter-design-guidelines.md) holds the design rules. Read it before writing a rule, a message, a reporter or output schema, or an agent integration.
