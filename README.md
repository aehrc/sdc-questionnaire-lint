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

**Status:** the CLI, input selection, reporters, configuration and `explain` work. Expression discovery works, with five built-in rules: `sdc/parse-error`, `sdc/unknown-function`, `sdc/query-syntax`, `sdc/fragment-parse-error` and `sdc/uncatalogued-expression`. Suppressions work, with `lint/stale-suppression` for the ones no longer needed. Plugins work: an `.mjs` config can list plugin rules. FSH source mapping works. Not built yet: the Smart Forms plugin's rules, and the scope model and the rules that depend on it.

Start with these docs:

- [Core plan](docs/core-plan.md) and [amendments](docs/plan-amendments.md) — scope and decisions; amendments take precedence.
- [CLI contract](docs/cli.md) — commands, configuration, exit codes and automation recipes.
- [Report format](docs/report-format.md), [JSON Schema](docs/schemas/lint-report.schema.json) and [examples](docs/examples/reports/README.md) — machine integration.
- [How the linter works](docs/architecture.md) — the pipeline of one lint run through the source, for contributors.

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
- `rules`: a rule ID set to `error`, `warning`, `info` or `off`. A rule that is `off` does not run. `lint/stale-suppression` accepts only `warning` or `off`.
- `suppress`: suppressions; see below.
- `plugins`: plugins whose rules run; only in an `.mjs` config. See below.

Paths in the config are relative to the config's directory, not the current one. From the parent of an IG, `sdc-lint lint --config ig/sdc-questionnaire-lint.config.json` checks `ig/fsh-generated/resources`.

```sh
sdc-lint explain                    # every rule, with its default and effective severity
sdc-lint explain sdc/parse-error    # what the rule checks, why, an example message and the fix
```

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

`check` must be synchronous; it runs once per Questionnaire. A rule that throws, returns a promise or reports an invalid finding, such as one with an empty message, stops the run with exit 2 and `RULE_CRASH` naming the rule. The types `LintPlugin`, `LintRule`, `RuleContext` and `RuleFinding` are exported from the package. Logging from a config or a rule goes to stderr, so it never mixes with the report.

### Suppressing a finding

A suppression hides one rule's findings at one expression. Add it to `suppress` in the config:

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

A suppression is **stale** when the run establishes that it hides nothing: its file was deleted, no expression matches it any more, or its rule checked the expression and found no problem. It is reported as a `lint/stale-suppression` warning at the config entry. A suppression the run cannot judge, such as one for a file outside a targeted run, is **not assessed** and reported only in the counts; [cli.md](docs/cli.md#stale-suppressions) has the full rules.

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
