# Configuration

A config file sets what `sdc-lint` lints, where your FSH lives, which names the application running the form supplies, how severe each rule is, which findings to suppress and which plugins to load. Without one, the linter lints `fsh-generated/resources` with the built-in rules at their default severities.

## The config file

`sdc-lint lint` and `sdc-lint explain` read the config from the directory you run them in. It is one of:

- `sdc-questionnaire-lint.config.json`: plain JSON. Use it unless you need plugins.
- `sdc-questionnaire-lint.config.mjs`: a JavaScript module that exports the config. Only this format can list plugins, because a plugin is code.

Only the current directory is searched, not its parents, and having both files is an error:

```console
$ npx sdc-lint lint
error: found both sdc-questionnaire-lint.config.json and sdc-questionnaire-lint.config.mjs in the current directory
help: choose one with --config, or remove the other file
```

To use a config elsewhere, or with another name, pass `--config <path>`, relative to the current directory. An explicit config must exist and be valid; the linter never falls back to the defaults.

```sh
npx sdc-lint lint --config ig/sdc-questionnaire-lint.config.json
```

The summary at the end of every run names the config it used, or says `Config: none, built-in defaults.`

## A JSON config

```json
{
  "files": ["fsh-generated/resources"],
  "source": { "fsh": ["input/fsh"] },
  "hostVariables": ["encounter"],
  "rules": {
    "sdc/unused-declaration": "off",
    "sdc/uncatalogued-expression": "warning"
  },
  "suppress": [
    {
      "rule": "sdc/undefined-variable",
      "file": "fsh-generated/resources/Questionnaire-intake.json",
      "linkId": "bmi",
      "reason": "Fixed upstream in the next release of the shared BMI profile."
    }
  ]
}
```

Every key is optional, and `{}` is a valid config.

## An `.mjs` config

An `.mjs` config takes the same keys, plus `plugins`. Wrap the export in `defineConfig` so your editor checks the keys and their values:

```js
// sdc-questionnaire-lint.config.mjs
import { defineConfig } from '@aehrc/sdc-questionnaire-lint';
import smartForms from '@aehrc/sdc-questionnaire-lint-plugin-smart-forms';

export default defineConfig({
  hostVariables: ['encounter'],
  plugins: [smartForms],
  compat: { 'smart-forms': { renderer: '1.4.0', populate: '4.7.1' } },
  rules: { 'smart-forms/repeating-group-variable': 'error' },
});
```

The linter imports this file, so it runs its code and the code of every plugin it imports. Only use an `.mjs` config and plugins you trust. Anything it logs goes to stderr, so it never mixes with the report.

## Keys

| Key | What it sets | Default |
| :- | :- | :- |
| `files` | The compiled files, directories or globs `sdc-lint lint` checks when no paths are given | `["fsh-generated/resources"]` |
| `source.fsh` | The FSH directories findings point into | `["input/fsh"]` |
| `hostVariables` | Names the application running the form supplies | none |
| `rules` | A severity, or `off`, for each rule | each rule's default |
| `suppress` | Reviewed findings to hide, each with a reason | none |
| `plugins` | Plugins whose rules run; `.mjs` only | none |
| `compat` | The runtime versions each plugin checks forms against | `"latest"` |

### `files`

What a run lints when you give `sdc-lint lint` no paths: files, directories or globs of compiled Questionnaire or Bundle JSON. A directory includes every `.json` file beneath it. The list cannot be empty.

Paths on the command line replace `files` for that run, and make it a *targeted run*: `sdc-lint lint fsh-generated/resources/Questionnaire-intake.json` lints only that file, whatever the config says. Without paths, a run is a *full run* over `files`. The difference matters for [stale suppressions](suppression.md#stale-suppressions).

### `source.fsh`

The FSH directories the linter searches to point each finding at its FSH line instead of the compiled JSON. A missing directory is not an error; findings keep their JSON location. Set `"source": { "fsh": [] }` to turn FSH lookup off. `fsh` is the only key under `source`.

### `hostVariables`

The names, written without `%`, that the application running the form supplies, such as an `additionalContext` entry. Every expression can reference them without declaring them, and `sdc/undefined-variable` accepts them.

```json
{ "hostVariables": ["encounter", "user"] }
```

List each exact name once. These are config errors:

- an empty list, or a name listed twice;
- a name written with `%`, such as `%encounter`;
- a name FHIRPath, FHIR or SDC defines, such as `resource`, `questionnaire`, `qitem`, or any name that starts with `vs-` or `ext-`. The built-in meaning of such a name always wins, so listing it would never supply a value. An application that supplies `%questionnaire` or `%qitem` itself [suppresses](suppression.md) the findings about them, with a reason that names the application.

A plugin can supply names too. With the Smart Forms plugin, do not list the sourceQueries results it supplies, such as `PrePopQuery`.

### `rules`

A rule ID and its setting:

| Setting | Effect |
| :- | :- |
| `error` | Reported, and fails the run with exit code 1 |
| `warning` | Reported; the run still passes |
| `info` | Reported; text output shows it only with `--show-info` |
| `off` | The rule does not run |

```json
{
  "rules": {
    "sdc/unused-declaration": "off",
    "sdc/uncatalogued-expression": "warning"
  }
}
```

A rule you leave out keeps its default severity. A plugin's rules can be set once the plugin is listed in `plugins`. `lint/stale-suppression` accepts only `warning` or `off`.

To see every rule's ID, default severity and the severity your config gives it, run:

```sh
npx sdc-lint explain                         # every rule
npx sdc-lint explain sdc/undefined-variable  # one rule: what it checks, why, an example and the fix
```

The [rules library](rules/index.md) has a page for each rule, with what it checks and an example form.

### `suppress`

Findings you have reviewed and accept at one expression, each with `rule`, `file` and a `reason`. [Suppression](suppression.md) explains the entry keys, how to find them, and stale suppressions.

### `plugins`

The plugins whose rules run, as imported objects. Installing a plugin does not enable it; listing it does. Only an `.mjs` config can list plugins:

```js
import { defineConfig } from '@aehrc/sdc-questionnaire-lint';
import myPlugin from 'my-sdc-lint-plugin';

export default defineConfig({
  plugins: [myPlugin],
  rules: { 'my-plugin/no-today': 'error' },
});
```

Each plugin's rule IDs start with its name, such as `smart-forms/`. Once it is listed, `sdc-lint explain` shows its rules. To write your own, see [Add yours](rules/add-yours.md).

### `compat`

The runtime versions a compatibility plugin, such as the Smart Forms plugin, checks forms against, by the plugin's name. Each entry is `"latest"` or exact versions by component:

```js
compat: { 'smart-forms': { renderer: '1.4.0', populate: '4.7.1' } }
```

Without an entry, a plugin checks against `"latest"`: the newest versions the installed plugin has verified, not the newest on npm. A version the plugin has not verified is an error, and its help lists the verified ones. For Smart Forms, name `template-extract` as well only when template extraction should be checked. The report records the versions a run used in `run.compat`. The [Smart Forms plugin](../README.md#the-smart-forms-plugin) lists its components and verified versions.

## Paths

Paths inside the config are relative to the config's directory, not the directory you run from. Paths on the command line, including `--config`, are relative to the current directory.

| Path | Relative to |
| :- | :- |
| CLI paths and `--config` | The current directory |
| `files`, `source.fsh` and a suppression's `file` | The config's directory |
| The defaults: `fsh-generated/resources`, `input/fsh` and SUSHI's index | The config's directory, or the current directory without a config |
| Paths in output | The current directory |

So from the parent of an IG, `sdc-lint lint --config ig/sdc-questionnaire-lint.config.json` lints `ig/fsh-generated/resources` and maps findings to `ig/input/fsh`. Absolute paths work everywhere.

## Config errors

Every key and value is checked before any form is read, and an unknown key is an error, so a typo is never silently ignored. An invalid config stops the run with exit code 2, naming the config file and the JSON Pointer of the bad entry:

```console
$ npx sdc-lint lint
error: config sdc-questionnaire-lint.config.json is invalid at /rules/sdc~1undefined-variabel: unknown rule sdc/undefined-variabel
help: a rule with a similar name exists: sdc/undefined-variable
```

```console
$ npx sdc-lint lint
error: config sdc-questionnaire-lint.config.json is invalid at /plugins: plugins can only be listed in an .mjs config, because a JSON config cannot load code
help: move the config to sdc-questionnaire-lint.config.mjs and import the plugins there
```

In the pointer, `~1` stands for `/`: `/rules/sdc~1undefined-variabel` is the `sdc/undefined-variabel` key of `rules`.

[Configuration and path bases](cli.md#configuration-and-path-bases) in the CLI contract has the full rules, and [Config](core/config.md) explains how the linter loads and checks the file.
