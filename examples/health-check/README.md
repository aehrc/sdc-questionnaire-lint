# Example: adult health check

A form with seven common authoring mistakes, written in FSH in `input/fsh/HealthCheck.fsh` and compiled by SUSHI 3.20.1 into `fsh-generated/`. The linter reports a finding at its FSH line when it can locate the expression there, and at the compiled JSON otherwise.

| Item | Where | FSH line | Mistake | Finding |
| :- | :- | :- | :- | :- |
| `bmi` | calculatedExpression, line 2 | 52, not located | `.round(1` has no closing `)` | `sdc/parse-error`, error |
| `bmi` | variable `h` | 48 | `fist()` is a typo for `first()` | `sdc/unknown-function`, error |
| `smoking` | cqf-expression on `_text` | 64 | the string uses `"…"`; FHIRPath strings use single quotes | `sdc/parse-error`, error |
| `packs` | enableWhenExpression | 84 | the expression ends with a dangling `and` | `sdc/parse-error`, error |
| `height` | variable `heights` | 36 | FHIRPath marked as `application/x-fhir-query` | `sdc/query-syntax`, error |
| `smoking` | variable `smokingStatus` | 69 | the x-fhir-query fragment `{{(today() - 1 year}}` has no closing `)` | `sdc/fragment-parse-error`, error |
| `smoking` | a custom extension on an answerOption | 75 | an expression in a place the linter does not recognise | `sdc/uncatalogued-expression`, info |

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
fsh-generated/resources/Questionnaire-HealthCheck.json: error sdc/parse-error This FHIRPath expression has a syntax error.
    / (%h * %h)).round(1
                        ^
  location: compiled JSON; Questionnaire/HealthCheck; /item/0/item/2/extension/1/valueExpression/expression
  note: FSH line not found, the expression spans several lines
  note: the FHIRPath parser reported: no viable alternative at input '1'

input/fsh/HealthCheck.fsh:36:23: error sdc/query-syntax This x-fhir-query is not a FHIR search, so the form's request fails and the fields it fills stay empty.
  %observations.where(code.coding.code = '8302-2')
  help: set the language to text/fhirpath; this expression is FHIRPath

input/fsh/HealthCheck.fsh:48:98: error sdc/unknown-function fist() is not a FHIRPath function, so this expression fails when the form runs.
  %resource.item.where(linkId = 'body').item.where(linkId = 'height').answer.fist().value / 100
                                                                             ^~~~
  help: a function with a similar name exists: first()

input/fsh/HealthCheck.fsh:64:64: error sdc/parse-error The character " is not valid here.
  'Hello ' + %patient.name.given.first() + ", do you smoke?"
                                           ^
  note: the FHIRPath parser reported: token recognition error at: '"'

input/fsh/HealthCheck.fsh:69:96: error sdc/fragment-parse-error A closing ) is missing.
  Observation?patient={{%patient.id}}&code=72166-2&date=ge{{(today() - 1 year}}
                                                                             ^
  note: the FHIRPath parser reported: missing ')' at '<EOF>'
  help: add ) at the end of the expression

input/fsh/HealthCheck.fsh:84:86: error sdc/parse-error The expression ends before it is complete.
  %resource.item.where(linkId = 'smoking').answer.value = 'Yes' and
                                                                   ^
  note: the FHIRPath parser reported: mismatched input '<EOF>'

7 findings (6 errors, 0 warnings, 1 info) in 1 questionnaire. 1 info finding hidden; use --show-info.
Inputs: full run; 1 file read, 0 skipped. Expressions: 13 analysed, 1 unchecked. Suppressed findings: 0.
Suppressions: 0 applied, 0 stale, 0 not assessed.
Config: none, built-in defaults. FSH sources: input/fsh.
Linter: 0.1.0. Plugins: sdc@0.1.0.
```

An x-fhir-query and each of its `{{…}}` fragments count as separate analysed expressions: the query on the root and `smokingStatus` with its two fragments add up to five. A fragment's finding shows the whole query, with the caret inside the fragment. The 1 unchecked expression is the one on the answerOption, whose scope cannot be analysed. For `.round(1` the parser does not say a `)` is missing, so the message is the generic one. The `bmi` calculatedExpression is written over two lines as a `"""` string, which the linter does not locate in FSH, so its finding names the compiled JSON and its JSON Pointer instead, and says why. Findings are sorted by file, then by FSH position, so it comes first.

To change the form, edit `input/fsh/HealthCheck.fsh` and run `sushi .` in this directory; SUSHI needs `hl7.fhir.uv.sdc#4.0.0`, which it downloads to the FHIR package cache. `packages/core/test/examples.test.ts` checks this output on every `npm test`.
