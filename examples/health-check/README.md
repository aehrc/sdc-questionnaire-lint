# Example: adult health check

A realistic SDC form with four mistakes that form authors often make. Run the local build of `sdc-lint` on it to see what the linter reports.

`fsh-generated/resources/Questionnaire-HealthCheck.json` stands in for SUSHI output, so the folder looks like an IG after `sushi .`. The form has:

- prefill from the patient's observations (an x-fhir-query `itemPopulationContext`);
- an `age` variable;
- a BMI calculation inside a group;
- question text that greets the patient by name (a cqf-expression on `_text`);
- a question that is shown only for smokers.

## The mistakes

| Item | Where | Mistake | Finding |
| :- | :- | :- | :- |
| `bmi` | calculatedExpression, line 2 of a multi-line expression | `.round(1` has no closing `)` | `sdc/parse-error`, error |
| `smoking` | cqf-expression on `_text` | the string uses `"…"`; FHIRPath strings use single quotes | `sdc/parse-error`, error |
| `packs` | enableWhenExpression | the expression ends with a dangling `and` | `sdc/parse-error`, error |
| `smoking` | a custom extension on an answerOption | an expression in a place the linter does not recognise | `sdc/unregistered-expression`, info |

Some expressions produce no finding:

- The x-fhir-query in `itemPopulationContext` is not parsed as FHIRPath. It is counted as unchecked.
- The `age` variable, the `h` variable and the `initialExpression` parse, so they are reported as nothing and counted as analysed.

## Run it with the local build

From the repository root, install and build once:

```sh
nvm use
npm ci
npm run build
```

`npm ci` links the workspace's `sdc-lint` into `node_modules/.bin`, so `npx` runs the local build from any folder in the repository:

```sh
cd examples/health-check
npx sdc-lint lint                  # errors and warnings; exit code 1
npx sdc-lint lint --show-info      # also the info finding
npx sdc-lint lint --format json    # the full JSON report
npx sdc-lint explain sdc/parse-error
```

Run `npm run build` again after changing the linter's source; `npx sdc-lint` runs `packages/core/dist/cli.js`, not the TypeScript.

To lint another IG with the local build, run the built file from the IG's folder:

```sh
cd path/to/your-ig
sushi .
node /path/to/sdc-questionnaire-lint/packages/core/dist/cli.js lint
```

Alternatively, run `npm link` once in `packages/core`. That makes `sdc-lint` available on your PATH, pointing to the local build; `npm unlink --global sdc-questionnaire-lint` removes it.

## Expected output

`npx sdc-lint lint`:

```text
fsh-generated/resources/Questionnaire-HealthCheck.json: error sdc/parse-error This FHIRPath expression has a syntax error.
    / (%h * %h)).round(1
                        ^
  location: compiled JSON; Questionnaire/HealthCheck; /item/0/item/2/extension/1/valueExpression/expression
  note: FSH line not found, no FSH sources are available
  note: the FHIRPath parser reported: no viable alternative at input '1'

fsh-generated/resources/Questionnaire-HealthCheck.json: error sdc/parse-error The character " is not valid here.
  'Hello ' + %patient.name.given.first() + ", do you smoke?"
                                           ^
  location: compiled JSON; Questionnaire/HealthCheck; /item/1/_text/extension/0/valueExpression/expression
  note: FSH line not found, no FSH sources are available
  note: the FHIRPath parser reported: token recognition error at: '"'

fsh-generated/resources/Questionnaire-HealthCheck.json: error sdc/parse-error The expression ends before it is complete.
  %resource.item.where(linkId = 'smoking').answer.value = 'Yes' and
                                                                   ^
  location: compiled JSON; Questionnaire/HealthCheck; /item/2/extension/0/valueExpression/expression
  note: FSH line not found, no FSH sources are available
  note: the FHIRPath parser reported: mismatched input '<EOF>'

4 findings (3 errors, 0 warnings, 1 info) in 1 questionnaire. 1 info finding hidden; use --show-info.
Inputs: full run; 1 file read, 0 skipped. Expressions: 6 analysed, 2 unchecked. Suppressed findings: 0.
Suppressions: 0 applied, 0 stale, 0 not assessed.
Config: none, built-in defaults. FSH sources: none found.
Linter: 0.1.0. Plugins: sdc@0.1.0.
```

There are 6 analysed and 2 unchecked expressions. The unchecked ones are the x-fhir-query and the expression on the answerOption. The linter does not know where that one is evaluated, so it checks only its syntax.

The first finding shows a current limit. For `.round(1` the parser does not say that a `)` is missing, so the message is the generic one. The caret marks where the parser stopped.

`packages/core/test/examples.test.ts` lints this folder, so the findings above are checked on every `npm test`.
