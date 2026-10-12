# sdc-questionnaire-lint

A CLI and TypeScript library for statically checking FHIRPath and x-fhir-query expressions in FHIR SDC Questionnaires, for form authors, CI pipelines and AI agents.

The npm package is `sdc-questionnaire-lint`; the CLI command is `sdc-lint`.

## Usage

In an implementation guide (IG), after building it with SUSHI:

```sh
sushi . && sdc-lint lint
```

With no paths, `lint` checks the compiled JSON in `fsh-generated/resources`. The linter reads compiled Questionnaires and Bundles, so run SUSHI again after editing FSH.

With FSH sources in `input/fsh`, a finding names the FSH file, line and column of its expression, as `input/fsh/Intake.fsh:42:18: error …`. The linter finds the FSH definition through SUSHI's `fsh-generated/data/fsh-index.json`, or by searching the FSH files, and never guesses a line: a finding whose expression it cannot locate reliably keeps its compiled JSON location and says why. That happens for an expression written by a RuleSet with parameters, one written over several lines, and repeated text that neither the item's linkId, the extension nor the expression's name tells apart.

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

**Status:** the CLI, input selection, reporters, configuration and `explain` work. Expression discovery works, with fifteen built-in rules: `sdc/parse-error`, `sdc/unknown-function`, `sdc/query-syntax`, `sdc/fragment-parse-error`, `sdc/uncatalogued-expression`, `sdc/language-not-in-value-set`, `sdc/language-not-allowed`, `sdc/external-expression`, `sdc/duplicate-declaration`, `sdc/reserved-name`, `sdc/undefined-variable`, `sdc/shadowed-declaration`, `sdc/dependency-cycle`, `sdc/unused-declaration` and `sdc/unresolved-linkid`. Suppressions work, with `lint/stale-suppression` for the ones no longer needed. Plugins work: an `.mjs` config can list plugin rules and select the runtime versions a compatibility plugin checks against. FSH source mapping works. The Smart Forms plugin has four rules: `smart-forms/unsupported-expression-language`, `smart-forms/expression-evaluated-as-fhirpath`, `smart-forms/questionnaire-variable-unavailable` and `smart-forms/unsupported-query-embedding`. Not built yet: the rest of the Smart Forms rules, slices P4 to P8 of the [Smart Forms rules plan](docs/smart-forms-rules.md).

Start with these docs, which are also a documentation site (see [Development](#development)):

- [Rules library](docs/rules/index.md) — a page per rule: what it checks and why, an example form in FSH with its compiled JSON and findings, the rule's test cases and its source.
- [Core plan](docs/core-plan.md) and [amendments](docs/plan-amendments.md) — scope and decisions; amendments take precedence.
- [Core rules plan](docs/core-rules.md) and [Smart Forms rules plan](docs/smart-forms-rules.md) — what each rule checks, its decisions and the runtime facts behind it.
- [CLI contract](docs/cli.md) — commands, configuration, exit codes and automation recipes.
- [Report format](docs/report-format.md), [JSON Schema](docs/schemas/lint-report.schema.json) and [examples](docs/examples/reports/README.md) — machine integration.
- [How the linter works](docs/architecture.md) — the pipeline of one lint run through the source, for contributors.
- [Adding a rule](docs/adding-a-rule.md) — the steps and checklists for a core, Smart Forms or plugin rule.

## Configuration

`lint` and `explain` use `sdc-questionnaire-lint.config.json` or `sdc-questionnaire-lint.config.mjs` from the current directory when it exists; parent directories are not searched, and having both is an error. `--config <path>` names another config instead, `.json` or `.mjs`. Without a config, the built-in rules run at their default severities.

```json
{
  "files": ["fsh-generated/resources"],
  "source": { "fsh": ["input/fsh"] },
  "rules": { "sdc/uncatalogued-expression": "off", "sdc/parse-error": "warning" }
}
```

- `files`: the inputs `lint` checks when no paths are given: files, directories or globs. Defaults to `fsh-generated/resources`.
- `source.fsh`: the FSH directories, defaulting to `["input/fsh"]`; `[]` omits FSH source lookup.
- `hostVariables`: names, written without `%`, that the application running the form supplies, such as `["PrePopQuery"]`. Every expression can reference them. List exact names; a name not listed, a typo included, is not available.
- `rules`: a rule ID set to `error`, `warning`, `info` or `off`. A rule that is `off` does not run. `lint/stale-suppression` accepts only `warning` or `off`.
- `suppress`: suppressions; see below.
- `plugins`: plugins whose rules run; only in an `.mjs` config. See below.
- `compat`: the runtime versions a compatibility plugin checks forms against, by plugin namespace; see [the Smart Forms plugin](#the-smart-forms-plugin).

Paths in the config are relative to the config's directory, not the current one. From the parent of an IG, `sdc-lint lint --config ig/sdc-questionnaire-lint.config.json` checks `ig/fsh-generated/resources`.

```sh
sdc-lint explain                    # every rule, with its default and effective severity
sdc-lint explain sdc/parse-error    # what the rule checks, why, an example message and the fix
```

`explain` works offline. The [rules library](docs/rules/index.md) has the same documentation, with an example form and the test cases of each rule.

### Plugins

A plugin adds rules. Installing one does not enable it: list it in `plugins` in an `.mjs` config, which exports the config with `defineConfig`. A JSON config cannot list plugins, because it cannot load code.

```js
// sdc-questionnaire-lint.config.mjs
import { defineConfig } from 'sdc-questionnaire-lint';
import myPlugin from 'my-sdc-lint-plugin';

export default defineConfig({
  plugins: [myPlugin],
  rules: { 'my-plugin/no-today': 'error' },
});
```

#### The Smart Forms plugin

`@sdc-questionnaire-lint/plugin-smart-forms` reports where [Smart Forms](https://github.com/aehrc/smart-forms) behaves differently from SDC, in the versions you select: an expression it ignores, evaluates in the wrong language, or that references a variable it never supplies. Its rules assume the form is populated with sdc-populate, then rendered.

```js
// sdc-questionnaire-lint.config.mjs
import { defineConfig } from 'sdc-questionnaire-lint';
import smartForms from '@sdc-questionnaire-lint/plugin-smart-forms';

export default defineConfig({
  plugins: [smartForms],
  compat: { 'smart-forms': { renderer: '1.4.0', populate: '4.7.1' } },
});
```

| Rule | Default | Reports |
| :- | :- | :- |
| `smart-forms/unsupported-expression-language` | error | An expression Smart Forms ignores because of its language |
| `smart-forms/expression-evaluated-as-fhirpath` | error | An expression Smart Forms evaluates as FHIRPath whatever its language |
| `smart-forms/questionnaire-variable-unavailable` | error | A reference to `%questionnaire` or `%qitem`, which Smart Forms does not supply |
| `smart-forms/unsupported-query-embedding` | error | A `{{…}}` embedding in an x-fhir-query that Smart Forms population does not fill as written |

`compat` is optional. Without it, the plugin checks against `"latest"`: the newest versions the installed plugin has verified, not the newest on npm. This version of the plugin verifies renderer 1.4.0, populate 4.7.1 and template-extract 1.0.15. An explicit object names `renderer` and `populate`, and `template-extract` only when template extraction should be checked. An unverified version, an unknown or missing component, or a `compat` entry for a plugin that is not listed fails with `CONFIG_INVALID`. The report names the selected versions in `run.compat`.

#### Writing a plugin

A plugin is an object with `meta: { name, version }` and `rules`. A rule's ID is `<meta.name>/<key>`: the rule `no-today` of the plugin `my-plugin` is `my-plugin/no-today`. Names and keys use lowercase letters, digits and hyphens; `sdc` and `lint` are reserved. Each rule has `meta: { description, defaultSeverity }`, optionally `docsUrl` and `docs`, and a `check(ctx)` that reports findings with `ctx.report({ site, message })` for each of `ctx.sites` it flags:

```js
const myPlugin = {
  meta: { name: 'my-plugin', version: '1.0.0' },
  rules: {
    'no-today': {
      meta: { description: 'Flags today() in expressions.', defaultSeverity: 'warning' },
      check(ctx) {
        for (const site of ctx.sites) {
          if (site.text?.includes('today()')) ctx.report({ site, message: 'This expression uses today().' });
        }
      },
    },
  },
};
```

`check` must be synchronous; it runs once per Questionnaire. A rule that throws, returns a promise or reports an invalid finding, such as one with an empty message, stops the run with exit 2 and `RULE_CRASH` naming the rule. A finding can also give `relatedLocations`, each a `site` or a `pointer` with an optional `message`, such as the other declaration of a duplicated name.

Besides `sites` and `report`, the context gives a rule core's name analysis: `ctx.referencesAt(site)` returns the `%name` references in a site's FHIRPath, `ctx.variablesAt(site)` the names available there and what each resolves to, and `ctx.declarations` every declaration in the Questionnaire. `referencesAt` and `variablesAt` return `undefined` when core cannot analyse the site, which a rule treats as "cannot check". A compatibility plugin declares its verified versions in `compat: { verified, required }`, and its rules read the versions the run selected from `ctx.compat`. The package exports the plugin types (`LintPlugin`, `LintRule`, `RuleContext`, `RuleFinding`, `RuleRelatedLocation`, `PluginCompat`), the site and analysis types, and the language lookups `definedLanguages`, `languagesAllowedAt` and `isQueryLanguage`; [How the linter works](docs/architecture.md#what-a-plugin-can-import) lists what a plugin can import. Logging from a config or a rule goes to stderr, so it never mixes with the report.

[Adding a rule](docs/adding-a-rule.md) walks through writing a rule step by step: findings and messages, `meta.docs` for `explain`, tests, and the checklists for a core rule, a Smart Forms rule and a rule in your own plugin.

### Suppressing a finding

A suppression hides one rule's findings at one expression, or at one name declared by a launchContext or an extractAllocateId, which are not expressions. Add it to `suppress` in the config:

```json
{
  "suppress": [
    {
      "rule": "sdc/parse-error",
      "file": "fsh-generated/resources/Questionnaire-intake.json",
      "linkId": "bmi",
      "extensionUrl": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression",
      "reason": "Fixed upstream in the next release of the shared profile."
    }
  ]
}
```

Every entry needs `rule`, `file` and a non-blank `reason`. `file` and the optional keys select the expression, and every one given must match:

| Key | Matches |
| :- | :- |
| `file` | The input file, relative to the config's directory |
| `linkId` | The enclosing item's linkId |
| `extensionUrl` | The URL of the extension that holds the expression |
| `name` | The expression's `name`, such as a variable's name |
| `resource` | `Questionnaire/<id>`, for a Bundle with several Questionnaires |
| `pointer` | The expression's JSON Pointer, as the report's `jsonLocation.pointer` shows it; for expressions with no item, such as in a contained resource |

The selectors must match exactly one expression; matching several is a config error. A suppression of an x-fhir-query also covers the FHIRPath in its `{{…}}` fragments.

An entry whose `extensionUrl` is `http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-launchContext` or `…/sdc-questionnaire-extractAllocateId` selects a declared name instead of an expression: the name on the item its `linkId` selects, or on the Questionnaire root when it has no `linkId`. For an item without a linkId, give the item's JSON Pointer, such as `/item/2`, as `pointer` instead; unlike for an expression, it is not the finding's pointer, so the entry survives reordering the item's extensions. It hides the rule's findings at every declaration of that name on that element, including a variable that repeats the name. The selectors must match one name on one element. For example, for two launchContexts named `patient` on the root:

```json
{
  "rule": "sdc/duplicate-declaration",
  "file": "fsh-generated/resources/Questionnaire-intake.json",
  "extensionUrl": "http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-launchContext",
  "name": "patient",
  "reason": "The host supplies one patient; the second launchContext is removed in the next release."
}
```

A suppression is **stale** when the run establishes that it hides nothing: its file was deleted, no expression or declared name matches it any more, or its rule checked the expression or declaration and found no problem. It is reported as a `lint/stale-suppression` warning at the config entry. A suppression the run cannot judge, such as one for a file outside a targeted run, is **not assessed** and reported only in the counts; [cli.md](docs/cli.md#stale-suppressions) has the full rules.

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

`npm run check` type-checks, lints, checks formatting, builds, tests and validates the published packages. CI runs it on Node 22 and 24; run it before every commit.

The repository is an npm workspace with three packages:

| Package | Path | Contents |
| :- | :- | :- |
| `sdc-questionnaire-lint` | [packages/core](packages/core) | The CLI, the library and the built-in rules |
| `@sdc-questionnaire-lint/plugin-smart-forms` | [packages/plugin-smart-forms](packages/plugin-smart-forms) | The Smart Forms plugin, with reproduction tests against the pinned Smart Forms packages |
| `@sdc-questionnaire-lint/lint-cases` | [packages/lint-cases](packages/lint-cases) | Private test support: lint cases written as YAML, compiled by SUSHI, linted and compared with their expected findings; the rules library shows them as examples |

A rule's tests are lint cases: `test/cases/<rule>/<case>.yaml` describes a form, and `<case>.expected.yaml` beside it lists the findings the linter must report.

```sh
npm test -- unused-declaration                       # run matching tests
npm run demo                                         # generate a SUSHI project from a lint case, compile and lint it
npm run demo -- <case.yaml> --smart-forms            # the same, with the Smart Forms plugin
npm run example -- demo/invalid-demo                 # compile and lint a SUSHI project, here the one demo wrote
npm run docs:dev                                     # serve the documentation site with live reload
npm run docs:build                                   # build it into docs/.vitepress/dist; fails on a dead link
```

The documentation site is built with VitePress from this README, the [glossary](GLOSSARY.md) and `docs/`. Its rules library is generated from the code: a page per rule from the rule's `meta.docs`, an example lint case compiled by SUSHI, and its other lint cases. Both commands build the packages first.

`npm run demo` writes `demo/invalid-demo` from `packages/core/test/cases/demo/invalid-demo.yaml`, or another config given as its argument; `--smart-forms` also lints it with the Smart Forms plugin. `npm run example` takes any directory with a `sushi-config.yaml`, followed by `lint` flags. `npm run corpus` needs a local `corpus/`, which is gitignored and not in the repository: copy the forms listed in slice 0 of the [core rules plan](docs/core-rules.md) into `corpus/forms/` first; without them it exits with that hint. `demo`, `example` and the lint cases compile with SUSHI 3.20.1, the `fsh-sushi` dev dependency, which `npm run` puts on the PATH. [AGENTS.md](AGENTS.md) lists the other development commands.
