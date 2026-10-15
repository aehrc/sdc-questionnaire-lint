# Getting started

sdc-questionnaire-lint checks the FHIRPath and x-fhir-query expressions in FHIR SDC Questionnaires without running the form. It finds a variable that is not declared, an unknown function, an expression that does not parse or a linkId that names no item, and reports each one at its expression. The `sdc-lint` command lints compiled Questionnaire JSON: the output of a SUSHI implementation guide (IG), or any Questionnaire or Bundle JSON files.

## Prerequisites

- [Node.js](https://nodejs.org/) 22.12 or later.
- Questionnaires as compiled JSON: Questionnaire resources, or Bundles that contain them.
- For an IG written in FSH, [SUSHI](https://fshschool.org/docs/sushi/) to compile it. The linter reads the compiled JSON, not the FSH, and points each finding at its FSH line.

## Quick start

::: warning Before the first release
The packages are not on npm yet, so `npm install sdc-questionnaire-lint` fails. Until the release, build them from the [repository](https://github.com/beda-software/sdc-questionnaire-lint) and install the packed tarball:

```sh
git clone https://github.com/beda-software/sdc-questionnaire-lint.git
cd sdc-questionnaire-lint
npm ci && npm run build
npm pack --workspace sdc-questionnaire-lint
# in your project:
npm install --save-dev ../sdc-questionnaire-lint/sdc-questionnaire-lint-0.1.0.tgz
```

The repository's [README](../README.md#development) lists the Node and npm versions a build needs.
:::

Install the linter in your project as a development dependency:

```sh
npm install --save-dev sdc-questionnaire-lint
```

Then lint your forms. In an IG, compile it with SUSHI first, then run `sdc-lint lint` from the IG's directory: with no paths, it lints `fsh-generated/resources`. For other JSON files, give the files, directories or globs to lint; quote a glob so the linter expands it, not the shell.

::: code-group

```console [SUSHI IG]
$ sushi .
$ npx sdc-lint lint
input/fsh/Intake.fsh:12:46: warning sdc/unused-declaration %height is declared on the Questionnaire root, but no expression references it, so its value is never used.
  %resource.item.where(linkId = 'height').answer.value
  help: remove the variable, or reference %height where its value is needed

input/fsh/Intake.fsh:25:64: error sdc/undefined-variable %hieght is not available on item "BMI" (bmi).
  %weight / %hieght.power(2)
            ^~~~~~~
  help: declare it on this item, an ancestor item or the root, or list it in hostVariables if the application running the form supplies it

2 findings (1 error, 1 warning, 0 info) in 1 questionnaire.
Inputs: full run; 1 file read, 0 skipped. Expressions: 3 analysed, 0 unchecked. Suppressed findings: 0.
Suppressions: 0 applied, 0 stale, 0 not assessed.
Config: none, built-in defaults. FSH sources: input/fsh.
Linter: 0.1.0. Plugins: sdc@0.1.0.
```

```console [Questionnaire JSON]
$ npx sdc-lint lint "questionnaires/*.json"
questionnaires/intake.json: error sdc/undefined-variable %hieght is not available on item "BMI" (bmi).
  %weight / %hieght.power(2)
            ^~~~~~~
  location: compiled JSON; Questionnaire/intake; /item/2/extension/0/valueExpression/expression
  note: FSH line not found, no FSH sources are available
  help: declare it on this item, an ancestor item or the root, or list it in hostVariables if the application running the form supplies it

questionnaires/intake.json: warning sdc/unused-declaration %height is declared on the Questionnaire root, but no expression references it, so its value is never used.
  %resource.item.where(linkId = 'height').answer.value
  location: compiled JSON; Questionnaire/intake; /extension/1/valueExpression/expression
  note: FSH line not found, no FSH sources are available
  help: declare it on this item, an ancestor item or the root, or list it in hostVariables if the application running the form supplies it

2 findings (1 error, 1 warning, 0 info) in 1 questionnaire.
Inputs: targeted run; 1 file read, 0 skipped. Expressions: 3 analysed, 0 unchecked. Suppressed findings: 0.
Suppressions: 0 applied, 0 stale, 0 not assessed.
Config: none, built-in defaults. FSH sources: none found.
Linter: 0.1.0. Plugins: sdc@0.1.0.
```

:::

Both runs lint the same form, a BMI calculation with a typo: `%hieght` for `%height`. Each finding names its location, its severity and the rule that reported it, shows the expression with the problem marked, and says how to fix it. In an IG the location is the FSH file, line and column; for plain JSON it is the file and the expression's JSON Pointer. One mistake can lead to two findings: the misspelt name is not declared, and the declared `%height` is never used.

Fix the FSH, compile again and lint again:

```console
$ sushi . && npx sdc-lint lint
0 findings in 1 questionnaire.
Inputs: full run; 1 file read, 0 skipped. Expressions: 3 analysed, 0 unchecked. Suppressed findings: 0.
Suppressions: 0 applied, 0 stale, 0 not assessed.
Config: none, built-in defaults. FSH sources: input/fsh.
Linter: 0.1.0. Plugins: sdc@0.1.0.
```

The exit code tells a script or CI job the outcome:

| Exit code | Meaning |
| :- | :- |
| 0 | No errors; warnings and info may remain |
| 1 | One or more errors |
| 2 | The run did not complete: bad config, unreadable input, no Questionnaires found, or wrong usage |

In an IG, add the commands as a script in `package.json`, such as `"lint": "sushi . && sdc-lint lint"`, so `npm run lint` always lints freshly compiled JSON. Use the linter from your project with `npx` or a script, not as a global install: each project then pins its own version, and the version in CI is the one you tested with.

## Configuration

Without a config, the built-in rules run at their default severities. To change them, add `sdc-questionnaire-lint.config.json` to the directory you run `sdc-lint` from:

```json
{
  "files": ["fsh-generated/resources"],
  "source": { "fsh": ["input/fsh"] },
  "hostVariables": ["encounter"],
  "rules": {
    "sdc/unused-declaration": "off",
    "sdc/uncatalogued-expression": "warning"
  }
}
```

- `files`: what `sdc-lint lint` checks when no paths are given. Defaults to `fsh-generated/resources`.
- `source.fsh`: the FSH directories findings point into. Defaults to `["input/fsh"]`.
- `hostVariables`: names, without `%`, that the application running the form supplies, such as an `additionalContext` entry. Expressions can reference them without declaring them.
- `rules`: a rule ID and its severity:
  - `error`: reported, and fails the run with exit code 1.
  - `warning`: reported; the run still passes.
  - `info`: reported; text output shows it only with `--show-info`.
  - `off`: the rule does not run.

Paths in the config are relative to the config file. To find a rule's ID and what it checks, run `sdc-lint explain` for every rule with its severity, or `sdc-lint explain <rule>` for one rule, its example and its fix. The [rules library](rules/index.md) has the same documentation with an example form for each rule.

The [configuration reference](../README.md#configuration) covers the rest: the `.mjs` config, `--config`, suppressions and plugins.

## Add the Smart Forms plugin

If your forms run in [Smart Forms](https://github.com/aehrc/smart-forms), the Smart Forms plugin reports where Smart Forms behaves differently from SDC: an expression it ignores, evaluates in the wrong language, or that references a variable it never supplies. Install it beside the linter:

```sh
npm install --save-dev @sdc-questionnaire-lint/plugin-smart-forms
```

A plugin runs code, so it is listed in an `.mjs` config, which replaces the JSON one. Name it `sdc-questionnaire-lint.config.mjs`:

```js
import { defineConfig } from 'sdc-questionnaire-lint';
import smartForms from '@sdc-questionnaire-lint/plugin-smart-forms';

export default defineConfig({
  plugins: [smartForms],
  compat: { 'smart-forms': { renderer: '1.4.0', populate: '4.7.1' } },
});
```

`compat` selects the Smart Forms versions to check against. It is optional: without it, the plugin checks against the newest versions it has verified. The plugin's rule IDs start with `smart-forms/`, and they appear in `sdc-lint explain` once the plugin is listed. The [Smart Forms plugin](../README.md#the-smart-forms-plugin) section lists its rules and the versions it verifies.

## Next steps

- [Rules library](rules/index.md): a page per rule, with what it checks, why, an example form and its findings.
- [CLI](cli.md): every command, flag and output format, with [recipes](cli.md#author-and-automation-recipes) for IG scripts and CI.
- In CI, `--format github` writes GitHub Actions annotations and a job summary, and `--format sarif` writes a SARIF log for code scanning.
- For scripts and AI agents, `--format json` writes one report described by the [JSON report format](report-format.md).
- [Suppressing a finding](../README.md#suppressing-a-finding): hide a finding you have reviewed, with a reason.
- [Writing a plugin](../README.md#writing-a-plugin) and [adding a rule](adding-a-rule.md): check your own conventions.
- [Glossary](../GLOSSARY.md): the terms these docs use.
