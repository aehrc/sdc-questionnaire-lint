# Example: adult health check

A form with four common authoring mistakes. `fsh-generated/resources/Questionnaire-HealthCheck.json` stands in for SUSHI output.

| Item | Where | Mistake | Finding |
| :- | :- | :- | :- |
| `bmi` | calculatedExpression, line 2 | `.round(1` has no closing `)` | `sdc/parse-error`, error |
| `smoking` | cqf-expression on `_text` | the string uses `"…"`; FHIRPath strings use single quotes | `sdc/parse-error`, error |
| `packs` | enableWhenExpression | the expression ends with a dangling `and` | `sdc/parse-error`, error |
| `smoking` | a custom extension on an answerOption | an expression in a place the linter does not recognise | `sdc/unregistered-expression`, info |

## Run it

From the repository root, run `npm ci` and `npm run build`. Then:

```sh
cd examples/health-check
npx sdc-lint lint                  # errors and warnings; exit code 1
npx sdc-lint lint --show-info      # also the info finding
npx sdc-lint lint --format json    # the full JSON report
```

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

The 2 unchecked expressions are the x-fhir-query, which is not parsed as FHIRPath, and the expression on the answerOption, whose scope cannot be analysed. For `.round(1` the parser does not say a `)` is missing, so the message is the generic one.

`packages/core/test/examples.test.ts` checks this output on every `npm test`.
