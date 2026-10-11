# sdc-questionnaire-lint

A CLI and library that statically checks the expressions (FHIRPath, x-fhir-query) inside FHIR SDC Questionnaires, with a plugin for Smart Forms compatibility rules.

Stack: TypeScript, Node 22+, tsup, Vitest; fhirpath.js pinned to 4.10.1.

An npm workspace of three packages:

- `packages/core` (`sdc-questionnaire-lint`): the CLI, the library and the built-in `sdc` rules.
- `packages/plugin-smart-forms` (`@sdc-questionnaire-lint/plugin-smart-forms`): the `smart-forms` plugin, its runtime facts and its reproduction tests against the pinned Smart Forms packages.
- `packages/lint-cases` (`@sdc-questionnaire-lint/lint-cases`): private test support, not built or published. It compiles lint cases with SUSHI, lints them and compares the findings.

## Docs

- [GLOSSARY.md](GLOSSARY.md) defines the core terms. Use its terms in code, messages and docs.
- [docs/core-plan.md](docs/core-plan.md) is the spec. Read the relevant section before working on scope, a rule, the plugin contract, configuration, suppressions, source mapping, the CLI or the IG integration.
- [docs/plan-amendments.md](docs/plan-amendments.md) lists decisions that override the plan. Read it every time you read the plan.
- [docs/core-rules.md](docs/core-rules.md) plans the `sdc` rules in slices, with their decisions (Dn). Read the slice and its decisions before working on a core rule or core's name analysis.
- [docs/smart-forms-rules.md](docs/smart-forms-rules.md) plans the `smart-forms` rules in slices, with their decisions (Sn) and the Smart Forms runtime facts. Read it before working on the plugin, `compat` or the API core publishes to plugins.
- [docs/cli.md](docs/cli.md) is the CLI contract: commands, flags, defaults, output formats and exit codes. Read it before working on the CLI or a reporter.
- [docs/report-format.md](docs/report-format.md) defines the JSON report, with its [schema](docs/schemas/lint-report.schema.json) and [examples](docs/examples/reports/README.md). Read it before changing what a report contains.
- [docs/architecture.md](docs/architecture.md) maps one lint run through `packages/core/src`, and lists what a plugin can import. Keep it current when the pipeline or the plugin API changes.
- [docs/linter-design-guidelines.md](docs/linter-design-guidelines.md) holds the design rules. Read it before writing a rule, a message, a reporter or output schema, or an agent integration.
- [docs/adding-a-rule.md](docs/adding-a-rule.md) is the step-by-step guide to adding a core, Smart Forms or plugin rule: the contract, findings, `meta.docs`, tests, the registration checklists and how to verify. Follow it when adding or changing a rule. The project skill [.claude/skills/add-rule](.claude/skills/add-rule/SKILL.md) works through it in order and says when each step is done.

## Commands

- `nvm use && npm ci`: install with the pinned Node and lockfile. npm must be 11.21.0 (`packageManager`); older npm drops native binaries from the lockfile on `npm install <package>`, and Vitest then fails with `Cannot find native binding`.
- `npm run check`: type-check, lint, format check, build, test and package checks (publint and attw on core and the plugin). Run before every commit.
- `npm test -- <pattern>`: run matching tests. Each package's test setup builds what its tests run: core for the CLI tests and the lint cases, and core and the plugin for the plugin's tests.
- `npm run typecheck`: type-check all three packages; it builds core first, because the plugin and lint-cases are type-checked against core's build output.
- `npm run build`: build core, then the plugin. lint-cases has no build: its exports are TypeScript sources.
- `npm run corpus`: lint the local, gitignored `corpus/` with the built-in rules and print the findings added or removed since its snapshot; `-- --update` saves the snapshot. `-- --smart-forms` lints with the plugin as well (`packages/plugin-smart-forms/scripts/corpus.config.mjs`), prints the selected Smart Forms versions, and compares with a separate snapshot. Not part of `npm run check`. Slice 0 of [docs/core-rules.md](docs/core-rules.md) lists the forms to copy into `corpus/forms/`.
- `npm run example -- <directory> [lint flags]`: compile a SUSHI project (any directory with a `sushi-config.yaml`) with SUSHI 3.20.1, then lint it with the built CLI. `npm run` puts the `fsh-sushi` dev dependency on the PATH. It rewrites the project's `fsh-generated/`.
- `npm run demo -- [config.yaml] [--out <directory>]`: generate a SUSHI project from one lint case config, by default `packages/core/test/cases/demo/invalid-demo.yaml` into the gitignored `demo/<instance>`, then compile and lint it with `example`. Use it to try a form by hand.
- `npm run format`: apply Prettier. Markdown, `docs/` and test fixtures are deliberately not formatted.
- Do not run `npm audit fix --force`: it downgrades `fhirpath` below the 4.10.1 pin.
- `npm run generate:functions --workspace sdc-questionnaire-lint`: regenerate `packages/core/src/analysis/fhirpath-function-catalog.ts`, the FHIRPath function catalogue, from the installed fhirpath.js. Run it after bumping `fhirpath`; never edit the file by hand.
- `npm run source-map:coverage --workspace sdc-questionnaire-lint -- <IG directory>`: map every expression of an IG's compiled Questionnaires to its FSH and check each result; run SUSHI in the IG first. It exits 1 below 95% mapped or on any failed check. A development script (`packages/core/scripts/source-map-coverage.ts`), bundled by tsup into `node_modules/.cache`; it is not shipped.
- Dependency versions are saved exactly (`save-exact` in `.npmrc`).
- Install scripts of dependencies are blocked unless allowed in `allowScripts` in `package.json`. After adding a dependency, review `npm install-scripts ls`.
- `fhirclient` is overridden with the empty stub `test/stubs/fhirclient` (root `devDependencies` and `overrides` in `package.json`). `@aehrc/sdc-populate`, a dev dependency of the plugin for reproduction tests, declares it but never imports it at run time, and the real package pulls in about 500 Expo and React Native packages and a `core-js` install script. The override names `@aehrc/sdc-populate@4.7.1`: re-check it when that version changes. Add the override before installing a new populate version, or npm keeps a nested real `fhirclient` in the lockfile.

## Tests

- A rule is tested with lint cases: `packages/<package>/test/cases/<rule>/<case>.yaml` describes a minimal form, and `<case>.expected.yaml` beside it holds the findings the linter must report. `packages/lint-cases/src/generate-fsh.ts` documents the config format; quote every whole expression.
- All cases of a package compile into one SUSHI project, cached in the gitignored `.cache/lint-cases/` and rebuilt only when a case changes.
- `npx vitest run -u packages/<package>/test/cases` writes the expected files. Review every change to them before committing.
- A Smart Forms runtime fact needs a reproduction test against the pinned package in `packages/plugin-smart-forms/test/reproduction/` where a harness exists, otherwise `source-only` evidence with a permalink.
- Never commit restricted forms, such as GP CCMP, or excerpts of their expressions; tests use synthetic minimal forms.

## Workflow

- `Don't use` changeset before the first official release
