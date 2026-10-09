# Example: adult health check

A form with seven common authoring mistakes. `fsh-generated/resources/Questionnaire-HealthCheck.json` stands in for SUSHI output. Its launchContext declares `%patient`, which several expressions use, so none of them gets an `sdc/undefined-variable` finding.

| Item | Where | Mistake | Finding |
| :- | :- | :- | :- |
| `bmi` | calculatedExpression, line 2 | `.round(1` has no closing `)` | `sdc/parse-error`, error |
| `bmi` | variable `h` | `fist()` is a typo for `first()` | `sdc/unknown-function`, error |
| `smoking` | cqf-expression on `_text` | the string uses `"…"`; FHIRPath strings use single quotes | `sdc/parse-error`, error |
| `packs` | enableWhenExpression | the expression ends with a dangling `and` | `sdc/parse-error`, error |
| `height` | variable `heights` | FHIRPath marked as `application/x-fhir-query` | `sdc/query-syntax`, error |
| `smoking` | variable `smokingStatus` | the x-fhir-query fragment `{{(today() - 1 year}}` has no closing `)` | `sdc/fragment-parse-error`, error |
| `smoking` | a custom extension on an answerOption | an expression in a place the linter does not recognise | `sdc/uncatalogued-expression`, info |

## Run it

From the repository root, run `npm ci` and `npm run build`. Then:

```sh
cd examples/health-check
npx sdc-lint lint                  # errors and warnings; exit code 1
npx sdc-lint lint --show-info      # also the info finding
npx sdc-lint lint --format json    # the full JSON report
npx sdc-lint explain sdc/parse-error  # what the rule checks and how to fix it
npx sdc-lint explain sdc/unknown-function
npx sdc-lint explain sdc/query-syntax
npx sdc-lint explain sdc/fragment-parse-error
```

## Expected output

`npx sdc-lint lint`:

```text
fsh-generated/resources/Questionnaire-HealthCheck.json: error sdc/fragment-parse-error A closing ) is missing.
  Observation?patient={{%patient.id}}&code=72166-2&date=ge{{(today() - 1 year}}
                                                                             ^
  location: compiled JSON; Questionnaire/HealthCheck; /item/1/extension/0/valueExpression/expression
  note: FSH line not found, no FSH sources are available
  note: the FHIRPath parser reported: missing ')' at '<EOF>'
  help: add ) at the end of the expression

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

fsh-generated/resources/Questionnaire-HealthCheck.json: error sdc/query-syntax This x-fhir-query is not a FHIR search, so the form's request fails and the fields it fills stay empty.
  %observations.where(code.coding.code = '8302-2')
  location: compiled JSON; Questionnaire/HealthCheck; /item/0/item/1/extension/0/valueExpression/expression
  note: FSH line not found, no FSH sources are available
  help: set the language to text/fhirpath; this expression is FHIRPath

fsh-generated/resources/Questionnaire-HealthCheck.json: error sdc/unknown-function fist() is not a FHIRPath function, so this expression fails when the form runs.
  %resource.item.where(linkId = 'body').item.where(linkId = 'height').answer.fist().value / 100
                                                                             ^~~~
  location: compiled JSON; Questionnaire/HealthCheck; /item/0/item/2/extension/0/valueExpression/expression
  note: FSH line not found, no FSH sources are available
  help: a function with a similar name exists: first()

7 findings (6 errors, 0 warnings, 1 info) in 1 questionnaire. 1 info finding hidden; use --show-info.
Inputs: full run; 1 file read, 0 skipped. Expressions: 12 analysed, 2 unchecked. Suppressed findings: 0.
Suppressions: 0 applied, 0 stale, 0 not assessed.
Config: none, built-in defaults. FSH sources: none found.
Linter: 0.1.0. Plugins: sdc@0.1.0.
```

An x-fhir-query and each of its `{{…}}` fragments count as separate analysed expressions: the query on the root and `smokingStatus` with its two fragments add up to five. A fragment's finding shows the whole query, with the caret inside the fragment. The 2 unchecked expressions are the one on the answerOption, whose scope cannot be analysed, and the root variable `age`, which only that expression references, so `sdc/unused-declaration` cannot tell whether it is used. For `.round(1` the parser does not say a `)` is missing, so the message is the generic one.

`packages/core/test/examples.test.ts` checks this output on every `npm test`.
