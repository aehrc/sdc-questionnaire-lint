# sdc-questionnaire-lint

A CLI and library that statically checks the expressions (FHIRPath, x-fhir-query) inside FHIR SDC Questionnaires, with a plugin for Smart Forms compatibility rules.

Stack: TypeScript, Node 22+, tsup, Vitest; fhirpath.js pinned to 4.10.1.

## Docs

- [GLOSSARY.md](GLOSSARY.md) defines the core terms. Use its terms in code, messages and docs.
- [docs/core-plan.md](docs/core-plan.md) is the spec. Read the relevant section before working on scope, a rule, the plugin contract, configuration, suppressions, source mapping, the CLI or the IG integration.
- [docs/plan-amendments.md](docs/plan-amendments.md) lists decisions that override the plan. Read it every time you read the plan.
- [docs/cli.md](docs/cli.md) is the CLI contract: commands, flags, defaults, output formats and exit codes. Read it before working on the CLI or a reporter.
- [docs/linter-design-guidelines.md](docs/linter-design-guidelines.md) holds the design rules. Read it before writing a rule, a message, a reporter or output schema, or an agent integration.

## Commands

- `nvm use && npm ci`: install with the pinned Node and lockfile. npm must be 11.21.0 (`packageManager`); older npm drops native binaries from the lockfile on `npm install <package>`, and Vitest then fails with `Cannot find native binding`.
- `npm run check`: type-check, lint, format check, build, test and package checks. Run before every commit.
- `npm test -- <pattern>`: run matching tests. CLI tests run against the built `packages/core/dist/cli.js`; the test setup rebuilds it.
- `npm run typecheck`: type-check both packages; it builds core first, because the plugin is type-checked against core's build output.
- `npm run build`: build both packages, core first.
- `npm run corpus`: lint the local, gitignored `corpus/` with the built-in rules and print the findings added or removed since its snapshot; `-- --update` saves the snapshot. Not part of `npm run check`. Slice 0 of [docs/core-rules.md](docs/core-rules.md) lists the forms to copy into `corpus/forms/`.
- `npm run example -- <valid|invalid|directory> [lint flags]`: compile an FSH project with SUSHI (`fsh-valid` or `fsh-invalid` in `packages/core/test/fixtures/cli/`, or any directory with a `sushi-config.yaml`), then lint it with the built CLI. Needs SUSHI 3.20.1 on the PATH. It rewrites the project's `fsh-generated/`, so commit the regenerated JSON with the FSH change.
- `npm run format`: apply Prettier. Markdown, `docs/` and test fixtures are deliberately not formatted.
- Do not run `npm audit fix --force`: it downgrades `fhirpath` below the 4.10.1 pin.
- `npm run generate:functions --workspace sdc-questionnaire-lint`: regenerate `packages/core/src/analysis/fhirpath-function-catalog.ts`, the FHIRPath function catalogue, from the installed fhirpath.js. Run it after bumping `fhirpath`; never edit the file by hand.
- `npm run source-map:coverage --workspace sdc-questionnaire-lint -- <IG directory>`: map every expression of an IG's compiled Questionnaires to its FSH and check each result; run SUSHI in the IG first. It exits 1 below 95% mapped or on any failed check. A development script (`packages/core/scripts/source-map-coverage.ts`), bundled by tsup into `node_modules/.cache`; it is not shipped.
- Dependency versions are saved exactly (`save-exact` in `.npmrc`).
- Install scripts of dependencies are blocked unless allowed in `allowScripts` in `package.json`. After adding a dependency, review `npm install-scripts ls`.
- `fhirclient` is overridden with the empty stub `test/stubs/fhirclient` (root `devDependencies` and `overrides` in `package.json`). `@aehrc/sdc-populate`, a dev dependency of the plugin for reproduction tests, declares it but never imports it at run time, and the real package pulls in about 500 Expo and React Native packages and a `core-js` install script. The override names `@aehrc/sdc-populate@4.7.1`: re-check it when that version changes. Add the override before installing a new populate version, or npm keeps a nested real `fhirclient` in the lockfile.

## Workflow

- `Don't use` changeset before the first official release
