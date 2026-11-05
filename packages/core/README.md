# @aehrc/sdc-questionnaire-lint

Static checks for the FHIRPath and x-fhir-query expressions in [FHIR SDC](https://hl7.org/fhir/uv/sdc/) Questionnaires. It finds a variable that is not declared, an unknown function, an expression that does not parse or a linkId that names no item, without running the form, and reports each one at its expression. For an implementation guide written in FSH, it points each finding at its FSH line.

It is a CLI, `sdc-lint`, and a TypeScript library, for form authors, CI pipelines and AI agents.

## Install

Requires Node.js 22.12 or later.

```sh
npm install --save-dev @aehrc/sdc-questionnaire-lint
```

## Usage

In an implementation guide, compile it with SUSHI first, then lint from the IG's directory: with no paths, `sdc-lint lint` checks `fsh-generated/resources`.

```sh
sushi . && npx sdc-lint lint
```

```console
input/fsh/Intake.fsh:25:64: error sdc/undefined-variable %hieght is not available on item "BMI" (bmi).
  %weight / %hieght.power(2)
            ^~~~~~~
  help: declare it on this item, an ancestor item or the root, or list it in hostVariables if the application running the form supplies it
```

Any Questionnaire or Bundle JSON can be linted by path:

```sh
npx sdc-lint lint "questionnaires/*.json"     # quote globs
npx sdc-lint lint --format json > report.json  # one JSON report on stdout
npx sdc-lint lint --format github              # GitHub Actions annotations and job summary
npx sdc-lint lint --format sarif > lint.sarif  # SARIF for code scanning
npx sdc-lint explain                           # every rule, with its severity
npx sdc-lint explain sdc/undefined-variable    # what a rule checks, why, and the fix
```

| Exit code | Meaning |
| :- | :- |
| 0 | Analysis completed with no unsuppressed errors |
| 1 | Analysis completed with one or more unsuppressed errors |
| 2 | The run did not complete: bad config, unreadable input, no Questionnaires found, a rule or plugin crash, or wrong usage |

## Configuration

`sdc-lint` reads `sdc-questionnaire-lint.config.json` or `sdc-questionnaire-lint.config.mjs` from the current directory, or the file `--config` names. Without one, the built-in rules run at their default severities.

```json
{
  "files": ["fsh-generated/resources"],
  "hostVariables": ["encounter"],
  "rules": { "sdc/shadowed-declaration": "off" }
}
```

A config can also suppress individual findings, and an `.mjs` config can list plugins. The [configuration guide](https://github.com/aehrc/sdc-questionnaire-lint/blob/main/docs/configuration.md) describes every option.

## Rules

| Rule | Default | Reports |
| :- | :- | :- |
| `sdc/parse-error` | error | A FHIRPath expression that does not parse |
| `sdc/unknown-function` | error | A call to a function that fhirpath.js does not implement |
| `sdc/query-syntax` | error | An x-fhir-query that is not a FHIR search |
| `sdc/fragment-parse-error` | error | A FHIRPath expression embedded in an x-fhir-query that does not parse |
| `sdc/language-not-allowed` | error | An expression language that SDC does not allow at its location |
| `sdc/language-not-in-value-set` | warning | An expression language that FHIR R4 and R5 do not define |
| `sdc/duplicate-declaration` | error | A name declared more than once on one item or on the root |
| `sdc/reserved-name` | error | A declaration of a name that FHIRPath, FHIR or SDC defines |
| `sdc/undefined-variable` | error | A `%name` that is not available where it is used |
| `sdc/unresolved-linkid` | warning | A literal linkId that no item in the Questionnaire has |
| `sdc/unused-declaration` | warning | A variable that no expression references |
| `sdc/dependency-cycle` | warning | Declarations whose expressions reference each other in a cycle |
| `sdc/shadowed-declaration` | info | A name an item declares that an ancestor item or the root also declares |
| `sdc/external-expression` | info | An expression whose content is only behind a reference |
| `sdc/uncatalogued-expression` | info | An expression in a place the linter does not recognise |
| `lint/stale-suppression` | warning | A suppression that is no longer needed |

The [rules library](https://github.com/aehrc/sdc-questionnaire-lint/blob/main/docs/rules/index.md) has a page per rule, with an example form.

## Plugins

A plugin adds rules, such as checks for how a particular SDC implementation behaves. [`@aehrc/sdc-questionnaire-lint-plugin-smart-forms`](https://www.npmjs.com/package/@aehrc/sdc-questionnaire-lint-plugin-smart-forms) reports where [Smart Forms](https://github.com/aehrc/smart-forms) behaves differently from SDC. To write your own, see [Adding a rule](https://github.com/aehrc/sdc-questionnaire-lint/blob/main/docs/adding-a-rule.md).

## Library

```ts
import { lint, LintFailure } from '@aehrc/sdc-questionnaire-lint';

try {
  const report = await lint({ cwd: process.cwd(), paths: ['questionnaires/intake.json'] });
  for (const finding of report.findings) console.log(finding.ruleId, finding.message);
  console.log(`${report.summary.errors} errors`);
} catch (error) {
  if (error instanceof LintFailure) console.error(error.message); // the run did not complete
  else throw error;
}
```

`lint` returns the same report as `--format json`; the [report format](https://github.com/aehrc/sdc-questionnaire-lint/blob/main/docs/report-format.md) describes it.

## Documentation

- [Getting started](https://github.com/aehrc/sdc-questionnaire-lint/blob/main/docs/getting-started.md)
- [CLI contract](https://github.com/aehrc/sdc-questionnaire-lint/blob/main/docs/cli.md): commands, flags, output formats and exit codes
- [Repository](https://github.com/aehrc/sdc-questionnaire-lint)

## Licence

Copyright © 2026 Commonwealth Scientific and Industrial Research Organisation
(CSIRO) ABN 41 687 119 230. Licensed under the
[Apache License, Version 2.0](https://github.com/aehrc/sdc-questionnaire-lint/blob/main/LICENSE).
