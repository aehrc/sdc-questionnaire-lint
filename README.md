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

## Development

The library and CLI are being built. The packages and toolchain are set up, but the CLI currently only answers `--version`.

### Prerequisites

- Node 22.12 or later. `.nvmrc` selects Node 22; CI also tests Node 24.
- npm 11.21.0, the version in `packageManager`. The npm bundled with Node 22 is older and must be upgraded:

  ```sh
  nvm install && nvm use
  npm install --global npm@11.21.0
  ```

  Older npm drops native binaries from the lockfile when a package is added, and Vitest then fails to start with `Cannot find native binding`.

### Getting started

```sh
nvm use
npm ci
npm run check
```

`npm run check` type-checks, lints, checks formatting, builds, tests and validates both packages. It is what CI runs; run it before every commit.

To try the CLI from a checkout:

```sh
npm run build
npx sdc-lint --version
```

`npx sdc-lint` and `npx sdc-questionnaire-lint` run `packages/core/dist/cli.js`, so rebuild after changing the source.

### Repository layout

| Path | Contents |
| :- | :- |
| `packages/core/` | `sdc-questionnaire-lint`: the library and the `sdc-lint` CLI |
| `packages/plugin-smart-forms/` | `@sdc-questionnaire-lint/plugin-smart-forms`: Smart Forms compatibility rules and the compatibility matrix (`compat/`) |
| `docs/` | Spec, CLI contract, report format, JSON Schema and example reports |
| `.changeset/` | Pending release notes and version bumps |
| `.github/workflows/ci.yml` | CI: `npm run check` on Node 22 and 24 |

The two packages are npm workspaces. The plugin depends on core only through core's public exports and is type-checked against core's built declarations, so core is always built first.

### Scripts

| Command | What it does |
| :- | :- |
| `npm run check` | Everything below, in order; what CI runs |
| `npm run typecheck` | Type-check the root configs and both packages; builds core before the plugin |
| `npm run lint` | ESLint |
| `npm run format` / `npm run format:check` | Apply / check Prettier |
| `npm run build` | Build both packages with tsup, core first |
| `npm test` | Run all tests once |
| `npm test -- <pattern>` | Run tests whose file path matches `<pattern>` |
| `npm run test:watch` | Re-run tests on change |
| `npm run check:package` | Check the packed packages with publint and attw |
| `npx vitest run --coverage` | Coverage report for `packages/*/src` |

### Tools

| Tool | Used for |
| :- | :- |
| [TypeScript](https://www.typescriptlang.org/) 6.0 | Strict, ESM-only (`NodeNext`) type-checking. Pinned below 7 because typescript-eslint and tsup's declaration build do not support TypeScript 7 yet |
| [tsup](https://tsup.egoist.dev/) | Builds each package to ESM with type declarations |
| [Vitest](https://vitest.dev/) | Tests; one Vitest project per package |
| [Ajv](https://ajv.js.org/) | Validates `docs/examples/reports/` against the report JSON Schema in tests |
| [ESLint](https://eslint.org/) with [typescript-eslint](https://typescript-eslint.io/) | Type-aware linting, plus rules that encode the spec: no `console` in package sources, no network access in rules |
| [Prettier](https://prettier.io/) | Formatting code and config. Markdown, `docs/`, `package.json` files and test fixtures are not formatted |
| [publint](https://publint.dev/) and [Are the Types Wrong?](https://arethetypeswrong.github.io/) | Check that the published packages resolve, with types, as ESM |
| [Changesets](https://github.com/changesets/changesets) | Versioning and changelogs for the two packages |
| [fhirpath.js](https://github.com/HL7/fhirpath.js) 4.10.1 | FHIRPath parser; pinned exactly |

### Tests

- Test files are `packages/*/test/**/*.test.ts`.
- CLI tests run the built `packages/core/dist/cli.js` as a separate process and check stdout, stderr and exit codes. The test setup rebuilds core first. Because the CLI runs in another process, coverage reports it as untested.
- `packages/core/test/report-schema.test.ts` validates every example report in `docs/` against the JSON Schema, so the docs and the code fail together.
- Fixtures go in `packages/*/test/fixtures/<scenario>/`, laid out like an IG (`input/fsh/`, `fsh-generated/`). They are committed SUSHI output, so tests need neither SUSHI nor the network.

### Releases

Every pull request that changes a package needs a changeset:

```sh
npx changeset add          # choose packages and bump types
npx changeset add --empty  # for changes that need no release
```

`npx changeset status` checks this. The plugin is only bumped when a core release leaves its peer dependency range. Publishing is not set up yet.

### Dependency notes

- Dependency versions are saved exactly (`save-exact` in `.npmrc`).
- Install scripts of dependencies are blocked unless listed in `allowScripts` in `package.json`. esbuild, fhirpath and fsevents are denied; none of them is needed. After adding a dependency, review `npm install-scripts ls`.
- `npm audit` reports moderate issues in `csv-parse`, which fhirpath uses. There is no compatible fix. Do not run `npm audit fix --force`: it downgrades fhirpath below the 4.10.1 pin.
