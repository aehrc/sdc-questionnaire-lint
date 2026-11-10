# sdc-questionnaire-lint

TypeScript CLI and library for checking FHIR SDC Questionnaire expressions, with a Smart Forms compatibility plugin. Packages:

- `packages/core`: CLI, library and built-in `sdc` rules.
- `packages/plugin-smart-forms`: plugin, runtime facts and reproduction tests.
- `packages/lint-cases`: private SUSHI-based test support; not built or published.

## Read before changing

Use [GLOSSARY.md](GLOSSARY.md) terms in code, messages and docs. Read the relevant sections for your task:

- Scope, rules, plugin contract, configuration, suppressions, source mapping, CLI or IG integration: [core plan](docs/core-plan.md), always with [amendments](docs/plan-amendments.md), which take precedence.
- Core rules or name analysis: [core rules](docs/core-rules.md), including the slice's decisions.
- Plugin, compatibility or plugin API: [Smart Forms rules](docs/smart-forms-rules.md).
- CLI or reporters: [CLI contract](docs/cli.md).
- Report contents: [report format](docs/report-format.md), [schema](docs/schemas/lint-report.schema.json) and [examples](docs/examples/reports/README.md).
- Rules, messages, reporters, output schemas or agent integration: [design guidelines](docs/linter-design-guidelines.md).
- Adding or changing a rule: follow [adding a rule](docs/adding-a-rule.md), also available as the [.claude/skills/add-rule](.claude/skills/add-rule/SKILL.md) workflow.
- Pipeline or plugin API changes: update [architecture](docs/architecture.md).

## Development

Use `.nvmrc` and the exact npm version in `package.json#packageManager`; older npm can drop native binaries from the lockfile. Setup, demo and example commands are in [README.md](README.md#development).

- `npm run check`: type-check, lint, format, build, test and package checks. Run before every commit.
- `npm test -- <pattern>`: matching tests; setup builds the required packages.
- `npm run typecheck`: builds core before checking all packages. `npm run build`: core, then plugin.
- `npm run corpus`: compare local corpus findings; `-- --smart-forms` uses the plugin and a separate snapshot; `-- --update` saves it. Outside `check`; setup is in core rules, slice 0.
- `npm run format`: Prettier; excludes Markdown, docs and fixtures.
- `npm run generate:functions --workspace @aehrc/sdc-questionnaire-lint`: regenerate `packages/core/src/analysis/fhirpath-function-catalog.ts` after a fhirpath upgrade; never edit it by hand.
- `npm run source-map:coverage --workspace @aehrc/sdc-questionnaire-lint -- <IG directory>`: run after SUSHI; fails below 95% mapping or on any failed check. Development-only; not shipped.

## Dependencies

- Save exact versions. Review `npm install-scripts ls` after adding dependencies; installation scripts require `allowScripts` approval in `package.json`.
- Never run `npm audit fix --force`: it downgrades the pinned fhirpath dependency.
- Before upgrading populate, update its root `fhirclient` override. The stub avoids unused Expo/React Native dependencies and install scripts. Follow [the release guide](docs/plugin-smart-forms/new-release.md#2-run-the-reproduction-tests-against-the-new-versions) before installing.

## Tests

- Use synthetic minimal forms. Never commit restricted forms, including GP CCMP, or excerpts of their expressions.
- Rule cases: `packages/<package>/test/cases/<rule>/<case>.yaml` and adjacent `<case>.expected.yaml`. Format: `packages/lint-cases/src/generate-fsh.ts`; quote whole expressions.
- Cases compile once per package, cached in `.cache/lint-cases/` until changed.
- `npx vitest run -u packages/<package>/test/cases` updates expectations; review every change before committing.
- Runtime facts need reproduction tests against the pinned package where a harness exists; otherwise use `source-only` release permalinks.

## Documentation

- `npm run docs:dev` serves VitePress; `npm run docs:build` checks links. Both build the packages first.
- Add pages to `docs/.vitepress/config.ts`. Link files outside the site to GitHub.
- Rule pages are generated from `meta.docs`, lint cases and examples selected in `docs/.vitepress/rules.ts`; edit those sources.

## Workflow

- No changesets before the first official release.
- Publishing: bump the package version, then publish a GitHub release tagged `<package name without @aehrc/>@<version>`. Publish core before a plugin that needs it. The publish workflows check CI and tag/version agreement, then use npm trusted publishing.
- Smart Forms releases: the weekly workflow opens verification issues. Use Actions → **Smart Forms versions** → `dry-run` to preview; follow [the release guide](docs/plugin-smart-forms/new-release.md) to verify a release.
